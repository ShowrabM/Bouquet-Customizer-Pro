<?php
defined( 'ABSPATH' ) || exit;

class Bouquet_Customizer_API {
    public function __construct() {
        add_action( 'rest_api_init', [ $this, 'register_routes' ] );
    }

    /**
     * Register REST API endpoints for configuration and cart operations.
     */
    public function register_routes() {
        register_rest_route(
            'bouquet/v1',
            '/config/(?P<product_id>\d+)',
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'get_config' ],
                'permission_callback' => '__return_true',
            ]
        );

        register_rest_route(
            'bouquet/v1',
            '/add-to-cart',
            [
                'methods'             => 'POST',
                'callback'            => [ $this, 'add_to_cart' ],
                'permission_callback' => '__return_true',
            ]
        );
    }

    /**
     * Return configuration for a product.
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response|WP_Error
     */
    public function get_config( $request ) {
        $product_id = absint( $request['product_id'] );
        $config = bq_get_product_config( $product_id );

        if ( ! $config ) {
            return new WP_Error( 'bq_no_config', __( 'No custom bouquet configuration found.', 'bouquet-customizer-pro' ), [ 'status' => 404 ] );
        }

        return rest_ensure_response( $config );
    }

    /**
     * Add a customized bouquet to the cart.
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response|WP_Error
     */
    public function add_to_cart( $request ) {
        $params = $request->get_json_params();
        if ( empty( $params ) ) {
            $params = $request->get_params();
        }

        $nonce = $request->get_header( 'X-WP-Nonce' );
        if ( ! $nonce ) {
            $nonce = $request->get_header( 'x_wp_nonce' );
        }
        if ( ! $nonce ) {
            $nonce = sanitize_text_field( $params['nonce'] ?? '' );
        }

        if ( ! bq_verify_rest_nonce( $nonce ) ) {
            return new WP_Error( 'bq_invalid_nonce', __( 'Invalid nonce.', 'bouquet-customizer-pro' ), [ 'status' => 403 ] );
        }

        $product_id = absint( $params['product_id'] ?? 0 );
        $selected   = $params['selected_options'] ?? [];
        $preview    = sanitize_text_field( $params['preview_image'] ?? '' );

        if ( ! $product_id || ! is_array( $selected ) || empty( $selected ) ) {
            return new WP_Error( 'bq_invalid_data', __( 'Invalid customization request.', 'bouquet-customizer-pro' ), [ 'status' => 400 ] );
        }

        $product = wc_get_product( $product_id );
        if ( ! $product ) {
            return new WP_Error( 'bq_bad_product', __( 'Product not found.', 'bouquet-customizer-pro' ), [ 'status' => 404 ] );
        }

        $config = bq_get_product_config( $product_id );
        if ( ! $config ) {
            return new WP_Error( 'bq_missing_config', __( 'Configuration missing for product.', 'bouquet-customizer-pro' ), [ 'status' => 404 ] );
        }

        $base_price = floatval( $product->get_price() );
        $normalized = $this->normalize_selected_options( $config, $selected, $base_price );
        if ( is_wp_error( $normalized ) ) {
            return $normalized;
        }

        $sanitized    = $normalized['selections'];
        $option_total = $normalized['total'];

        $total_price = $base_price + $option_total;

        $this->ensure_cart_session();
        if ( ! WC()->cart ) {
            return new WP_Error( 'bq_cart_missing', __( 'Cart unavailable.', 'bouquet-customizer-pro' ), [ 'status' => 500 ] );
        }

        $cart_item_key = WC()->cart->add_to_cart(
            $product_id,
            1,
            0,
            [],
            [
                'bq_config' => [
                    'group_id' => $config['group_id'] ?? 0,
                    'selected' => $sanitized,
                    'base'     => $config,
                    'preview'  => $preview,
                ],
                'bq_price'   => $total_price,
                'bq_preview' => $preview,
            ]
        );

        if ( ! $cart_item_key ) {
            return new WP_Error( 'bq_cart_error', __( 'Unable to add bouquet to cart.', 'bouquet-customizer-pro' ), [ 'status' => 500 ] );
        }

        return rest_ensure_response(
            [
                'success'    => true,
                'cart_key'   => $cart_item_key,
                'totalPrice' => $total_price,
            ]
        );
    }

    /**
     * Validate and normalize selections against stored config.
     *
     * @param array $config
     * @param array $selected
     * @return array|WP_Error
     */
    private function normalize_selected_options( $config, $selected, $product_price = 0 ) {
        if ( empty( $selected ) || ! is_array( $selected ) ) {
            return new WP_Error( 'bq_invalid_data', __( 'No customization selections found.', 'bouquet-customizer-pro' ), [ 'status' => 400 ] );
        }

        $steps = $config['steps'] ?? [];
        if ( empty( $steps ) ) {
            return new WP_Error( 'bq_invalid_config', __( 'Configuration missing steps.', 'bouquet-customizer-pro' ), [ 'status' => 400 ] );
        }

        $normalized = [];
        $total      = 0;
        $step_counts = [];
        $seen        = [];

        foreach ( $selected as $choice ) {
            $step_index   = isset( $choice['stepIndex'] ) ? absint( $choice['stepIndex'] ) : -1;
            $option_index = isset( $choice['optionIndex'] ) ? absint( $choice['optionIndex'] ) : -1;

            if ( ! isset( $steps[ $step_index ] ) ) {
                return new WP_Error( 'bq_invalid_step', __( 'Invalid step selection.', 'bouquet-customizer-pro' ), [ 'status' => 400 ] );
            }

            $step_data = $steps[ $step_index ];
            if ( empty( $step_data['options'][ $option_index ] ) ) {
                return new WP_Error( 'bq_invalid_option', __( 'Invalid option selection.', 'bouquet-customizer-pro' ), [ 'status' => 400 ] );
            }

            $option_data = $step_data['options'][ $option_index ];
            $layers      = [];
            $layer_total = 0;
            $selection_mode = $step_data['selection'] ?? 'single';
            $input_type     = $step_data['input_type'] ?? 'radio';
            $signature      = $step_index . ':' . $option_index;
            $max_selections = isset( $step_data['max_selections'] )
                ? absint( $step_data['max_selections'] )
                : absint( $step_data['maxSelections'] ?? ( $step_data['maxSelection'] ?? 0 ) );
            if ( 'multiple' !== $selection_mode ) {
                $max_selections = 1;
            }

            if ( isset( $seen[ $signature ] ) ) {
                continue;
            }
            $seen[ $signature ] = true;

            if ( 'single' === $selection_mode ) {
                $step_counts[ $step_index ] = ( $step_counts[ $step_index ] ?? 0 ) + 1;
                if ( $step_counts[ $step_index ] > 1 ) {
                    return new WP_Error( 'bq_invalid_option', __( 'Only one option can be selected for this step.', 'bouquet-customizer-pro' ), [ 'status' => 400 ] );
                }
            } elseif ( $max_selections > 0 ) {
                $step_counts[ $step_index ] = ( $step_counts[ $step_index ] ?? 0 ) + 1;
                if ( $step_counts[ $step_index ] > $max_selections ) {
                    return new WP_Error( 'bq_invalid_option', __( 'Too many choices selected for this step.', 'bouquet-customizer-pro' ), [ 'status' => 400 ] );
                }
            }

            $custom_value_raw = $choice['custom_value'] ?? ( $choice['customValue'] ?? '' );
            $custom_value     = sanitize_textarea_field( $custom_value_raw );

            $custom_price_raw = $choice['custom_price'] ?? ( $choice['customPrice'] ?? null );
            $custom_price     = isset( $custom_price_raw ) ? floatval( $custom_price_raw ) : 0;

            if ( 'text_input' === $input_type && '' === $custom_value ) {
                return new WP_Error( 'bq_invalid_data', __( 'Text input is required for this option.', 'bouquet-customizer-pro' ), [ 'status' => 400 ] );
            }

            if ( 'custom_price' === $input_type && $custom_price <= 0 ) {
                return new WP_Error( 'bq_invalid_data', __( 'Enter a valid custom price.', 'bouquet-customizer-pro' ), [ 'status' => 400 ] );
            }

            if ( empty( $option_data['skip_layers'] ) ) {
                foreach ( (array) $option_data['layers'] as $layer ) {
                    $layer_url = esc_url_raw( $layer['url'] ?? '' );
                    if ( ! $layer_url ) {
                        continue;
                    }
                    $delta = floatval( $layer['price_delta'] ?? 0 );
                    $layers[] = [
                        'url'         => $layer_url,
                        'price_delta' => $delta,
                    ];
                    $layer_total += $delta;
                }
            }

            if ( 'custom_price' === $input_type ) {
                $option_data['price_type'] = 'custom';
            }

            $price_delta = $this->calculate_price_delta( $option_data, $layer_total, $product_price, $custom_price, $choice );

            $normalized[] = [
                'stepIndex'    => $step_index,
                'optionIndex'  => $option_index,
                'stepTitle'    => sanitize_text_field( $step_data['title'] ?? '' ),
                'optionTitle'  => sanitize_text_field( $option_data['title'] ?? '' ),
                'priceDelta'   => $price_delta,
                'priceType'    => $option_data['price_type'] ?? 'none',
                'priceValue'   => isset( $option_data['price_value'] ) ? floatval( $option_data['price_value'] ) : floatval( $option_data['price_delta'] ?? 0 ),
                'layers'       => $layers,
                'color'        => sanitize_hex_color( $option_data['color'] ?? '' ),
                'customValue'  => $custom_value,
                'custom_value' => $custom_value, // keep both shapes for front-end/back-end consumers
                'customPrice'  => $custom_price,
            ];

            $total += $price_delta;
        }

        if ( empty( $normalized ) ) {
            return new WP_Error( 'bq_invalid_data', __( 'No customization selections found.', 'bouquet-customizer-pro' ), [ 'status' => 400 ] );
        }

        return [
            'selections' => $normalized,
            'total'      => $total,
        ];
    }

    /**
     * Ensure the WooCommerce cart/session exists for REST requests.
     */
    private function ensure_cart_session() {
        if ( function_exists( 'wc_load_cart' ) ) {
            wc_load_cart();
        }

        if ( ! class_exists( 'WC_Cart' ) && defined( 'WC_ABSPATH' ) ) {
            include_once WC_ABSPATH . 'includes/class-wc-cart.php';
        }

        if ( ! WC()->cart ) {
            WC()->cart = new WC_Cart();
        }
    }

    /**
     * Calculate the option price adjustment considering price type.
     *
     * @param array $option_data
     * @param float $layer_total
     * @param float $product_price
     * @param float $custom_price
     * @param array $choice
     * @return float
     */
    private function calculate_price_delta( $option_data, $layer_total, $product_price, $custom_price = 0, $choice = [] ) {
        $price_type  = $option_data['price_type'] ?? 'none';
        $price_value = isset( $option_data['price_value'] ) ? floatval( $option_data['price_value'] ) : floatval( $option_data['price_delta'] ?? 0 );
        $quantity    = isset( $choice['quantity'] ) ? max( 1, absint( $choice['quantity'] ) ) : 1;

        switch ( $price_type ) {
            case 'fixed':
                $base = $price_value;
                break;
            case 'percentage':
                $base = $product_price * ( $price_value / 100 );
                break;
            case 'quantity':
                $base = $price_value * $quantity;
                break;
            case 'custom':
                $base = $custom_price;
                break;
            default:
                $base = isset( $option_data['price_delta'] ) ? floatval( $option_data['price_delta'] ) : 0;
                break;
        }

        return $base + $layer_total;
    }
}
