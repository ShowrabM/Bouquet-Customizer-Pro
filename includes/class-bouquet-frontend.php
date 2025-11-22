<?php
defined( 'ABSPATH' ) || exit;

class Bouquet_Customizer_Frontend {
    public function __construct() {
        add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_front_assets' ] );
        add_action( 'woocommerce_after_add_to_cart_button', [ $this, 'render_customizer_trigger' ] );
        add_filter( 'woocommerce_add_cart_item_data', [ $this, 'add_cart_item_data' ], 10, 3 );
        add_filter( 'woocommerce_get_cart_item_from_session', [ $this, 'restore_cart_item_data' ], 10, 2 );
        add_filter( 'woocommerce_get_item_data', [ $this, 'display_cart_item_data' ], 10, 2 );
        add_filter( 'woocommerce_cart_item_thumbnail', [ $this, 'render_cart_preview_thumbnail' ], 10, 3 );
        add_action( 'woocommerce_before_calculate_totals', [ $this, 'apply_custom_price' ] );
        add_action( 'woocommerce_checkout_create_order_line_item', [ $this, 'persist_order_data' ], 10, 4 );
        add_action( 'woocommerce_after_order_itemmeta', [ $this, 'render_order_preview' ], 10, 3 );
        add_action( 'woocommerce_order_item_meta_end', [ $this, 'render_order_preview' ], 10, 4 );
        add_filter( 'template_include', [ $this, 'maybe_use_full_canvas_template' ] );
        add_filter( 'body_class', [ $this, 'filter_body_class' ] );
    }

    /**
     * Only enqueue assets when product has a configuration.
     */
    public function enqueue_front_assets() {
        if ( ! function_exists( 'is_product' ) || ! is_product() ) {
            return;
        }

        $product_id = get_queried_object_id();

        if ( ! $product_id ) {
            global $product;
            if ( $product instanceof WC_Product ) {
                $product_id = $product->get_id();
            }
        }

        if ( ! $product_id ) {
            return;
        }

        $product = wc_get_product( $product_id );
        if ( ! $product ) {
            return;
        }

        if ( ! bq_product_has_config( $product_id ) ) {
            return;
        }

        wp_enqueue_style(
            'bq-frontend-style',
            BQP_URL . '/assets/css/bouquet-customizer.css',
            [],
            bq_get_asset_version( 'assets/css/bouquet-customizer.css' )
        );
        if ( get_post_meta( $product_id, BQP_TEMPLATE_META_KEY, true ) ) {
            wp_enqueue_style(
                'bq-canvas-style',
                BQP_URL . '/assets/css/bq-full-canvas-template.css',
                [],
                bq_get_asset_version( 'assets/css/bq-full-canvas-template.css' )
            );
        }
        wp_enqueue_script(
            'bq-frontend-script',
            BQP_URL . '/assets/js/bouquet-customizer.js',
            [ 'jquery' ],
            bq_get_asset_version( 'assets/js/bouquet-customizer.js' ),
            true
        );

        $config = bq_get_product_config( $product_id );

        wp_localize_script(
            'bq-frontend-script',
            'bqFrontendData',
            [
                'restUrl'        => untrailingslashit( rest_url( 'bouquet/v1' ) ),
                'nonce'          => wp_create_nonce( 'bq_rest_nonce' ),
                'restNonce'      => wp_create_nonce( 'wp_rest' ),
                'productId'      => $product_id,
                'basePrice'      => floatval( $product->get_price() ),
                'currencySymbol' => get_woocommerce_currency_symbol(),
                'currencyCode'   => get_woocommerce_currency(),
                'cartUrl'        => wc_get_cart_url(),
                'initialConfig'  => $config,
            ]
        );
    }

    /**
     * Swap in the plugin's full-canvas template when enabled on a product.
     *
     * @param string $template
     * @return string
     */
    public function maybe_use_full_canvas_template( $template ) {
        if ( ! is_singular( 'product' ) ) {
            return $template;
        }

        $product_id = get_queried_object_id();
        if ( ! $product_id ) {
            return $template;
        }

        $enabled = get_post_meta( $product_id, BQP_TEMPLATE_META_KEY, true );
        $path    = BQP_PATH . '/templates/bq-full-canvas-template.php';
        if ( $enabled && file_exists( $path ) ) {
            return $path;
        }

        return $template;
    }

    /**
     * Add a body class for canvas template.
     *
     * @param array $classes
     * @return array
     */
    public function filter_body_class( $classes ) {
        if ( is_singular( 'product' ) ) {
            $product_id = get_queried_object_id();
            if ( $product_id && get_post_meta( $product_id, BQP_TEMPLATE_META_KEY, true ) ) {
                $classes[] = 'bq-full-canvas-template';
            }
        }
        return $classes;
    }

    /**
     * Output the customizer button and modal shell.
     */
    public function render_customizer_trigger() {
        global $product;
        $product_id = 0;
        if ( $product instanceof WC_Product ) {
            $product_id = $product->get_id();
        } else {
            $product_id = get_queried_object_id();
        }

        if ( ! $product_id ) {
            return;
        }
        if ( ! bq_product_has_config( $product_id ) ) {
            return;
        }

        ?>
        <div class="bq-customizer-trigger">
            <button type="button" class="button bq-open-customizer" data-product-id="<?php echo esc_attr( $product_id ); ?>">
                <?php esc_html_e( 'Customize Your Bouquet', 'bouquet-customizer-pro' ); ?>
            </button>
        </div>
        <div id="bq-customizer-modal" class="bq-customizer-modal" hidden>
            <div class="bq-customizer-backdrop"></div>
            <div class="bq-customizer-panel">
                <button type="button" class="bq-customizer-close" aria-label="<?php esc_attr_e( 'Close bouquet customizer', 'bouquet-customizer-pro' ); ?>">&times;</button>
                <h2><?php esc_html_e( 'Bouquet Customizer', 'bouquet-customizer-pro' ); ?></h2>
                <div class="bq-customizer-body">
                <div class="bq-preview-panel">
                    <div class="bq-preview-stage">
                        <div class="bq-preview-stack" aria-live="polite"></div>
                        <canvas id="bq-preview-canvas" width="600" height="600"></canvas>
                    </div>
                    <p class="bq-total-price-label"><?php esc_html_e( 'Total Price:', 'bouquet-customizer-pro' ); ?> <strong class="bq-total-price-value"></strong></p>
                </div>
                    <div class="bq-step-list">
                        <p class="bq-loading"><?php esc_html_e( 'Loading configuration...', 'bouquet-customizer-pro' ); ?></p>
                    </div>
                </div>
                <button type="button" class="button button-primary bq-submit-config" disabled><?php esc_html_e( 'Add to Cart', 'bouquet-customizer-pro' ); ?></button>
            </div>
        </div>
        <?php
    }

    /**
     * Persist bouquet metadata on cart items.
     */
    public function add_cart_item_data( $cart_item_data, $product_id, $variation_id ) {
        if ( empty( $cart_item_data['bq_config'] ) ) {
            return $cart_item_data;
        }

        $cart_item_data['bq_meta'] = $cart_item_data['bq_config'];

        // If preview came through POST (non-REST add to cart), capture it.
        if ( empty( $cart_item_data['bq_preview'] ) && isset( $_POST['bq_preview'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing
            $cart_item_data['bq_preview'] = $this->sanitize_preview_payload( wp_unslash( $_POST['bq_preview'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Missing
        }
        if ( empty( $cart_item_data['bq_config']['preview'] ) && ! empty( $cart_item_data['bq_preview'] ) ) {
            $cart_item_data['bq_config']['preview'] = $cart_item_data['bq_preview'];
        }

        return $cart_item_data;
    }

    /**
     * Restore bouquet data from cart session.
     */
    public function restore_cart_item_data( $cart_item, $values ) {
        if ( isset( $values['bq_config'] ) ) {
            $cart_item['bq_config'] = $values['bq_config'];
        }
        if ( isset( $values['bq_preview'] ) ) {
            $cart_item['bq_preview'] = $values['bq_preview'];
        }
        if ( isset( $values['bq_price'] ) ) {
            $cart_item['bq_price'] = $values['bq_price'];
        }
        return $cart_item;
    }

    /**
     * Show summary under cart line item.
     */
    public function display_cart_item_data( $item_data, $cart_item ) {
        if ( empty( $cart_item['bq_config'] ) ) {
            return $item_data;
        }

        $selected = $cart_item['bq_config']['selected'] ?? [];
        $rows     = [];
        foreach ( $selected as $choice ) {
            $label      = $choice['optionTitle'] ?? '';
            $custom_val = $choice['customValue'] ?? ( $choice['custom_value'] ?? '' );
            if ( $custom_val ) {
                $label .= ' (' . $custom_val . ')';
            }
            $rows[] = esc_html( $choice['stepTitle'] ?? '' ) . ': ' . esc_html( $label );
        }

        if ( $rows ) {
            $item_data[] = [
                'key'   => __( 'Bouquet Customization', 'bouquet-customizer-pro' ),
                'value' => implode( ', ', $rows ),
            ];
        }

        return $item_data;
    }

    /**
     * Replace cart thumbnail with bouquet preview when available.
     */
    public function render_cart_preview_thumbnail( $product_thumbnail, $cart_item, $cart_item_key ) {
        $preview = $cart_item['bq_preview'] ?? '';
        if ( ! $preview && ! empty( $cart_item['bq_config']['preview'] ) ) {
            $preview = $cart_item['bq_config']['preview'];
        }
        if ( ! $preview ) {
            return $product_thumbnail;
        }

        $src = strpos( $preview, 'data:image' ) === 0 ? $preview : esc_url( $preview );

        return sprintf(
            '<img src="%s" alt="%s" style="width:90px;height:auto;border:1px solid #e1e4ed;border-radius:6px;padding:3px;" />',
            $src,
            esc_attr__( 'Bouquet preview', 'bouquet-customizer-pro' )
        );
    }

    /**
     * Ensure cart item price reflects selection.
     *
     * @param WC_Cart $cart
     */
    public function apply_custom_price( $cart ) {
        if ( is_admin() && ! defined( 'DOING_AJAX' ) ) {
            return;
        }

        foreach ( $cart->get_cart() as $cart_item ) {
            if ( isset( $cart_item['bq_price'] ) && isset( $cart_item['data'] ) ) {
                $cart_item['data']->set_price( floatval( $cart_item['bq_price'] ) );
            }
        }
    }

    /**
     * Add bouquet metadata to order items.
     */
    public function persist_order_data( $item, $cart_item_key, $values, $order ) {
        if ( empty( $values['bq_config'] ) ) {
            return;
        }

        $selected = $values['bq_config']['selected'] ?? [];
        $summary  = $this->format_selection_summary( $selected );

        if ( $summary ) {
            $item->add_meta_data( __( 'Bouquet Customization', 'bouquet-customizer-pro' ), $summary, true );
        }

        $item->add_meta_data( '_bq_config_payload', wp_json_encode( $values['bq_config'] ), true );

        if ( ! empty( $values['bq_preview'] ) ) {
            $stored = $this->store_preview_image( $values['bq_preview'] );
            if ( $stored && ! empty( $stored['url'] ) ) {
                $item->add_meta_data( BQP_PREVIEW_META_KEY, $stored['url'], true );
                if ( ! empty( $stored['attachment_id'] ) ) {
                    $item->add_meta_data( '_bq_preview_attachment', (int) $stored['attachment_id'], true );
                }
            } else {
                $item->add_meta_data( BQP_PREVIEW_META_KEY, $values['bq_preview'], true );
            }
        }
    }

    /**
     * Output preview image inside order details/email.
     *
     * @param int             $item_id
     * @param WC_Order_Item   $item
     * @param mixed           $context
     * @param bool            $plain_text
     */
    public function render_order_preview( $item_id, $item, $context = null, $plain_text = false ) {
        $preview = $item->get_meta( BQP_PREVIEW_META_KEY, true );
        if ( ! $preview ) {
            return;
        }

        $label       = __( 'Bouquet Preview', 'bouquet-customizer-pro' );
        $is_data_uri = 0 === strpos( $preview, 'data:image' );

        if ( $plain_text ) {
            $value = $is_data_uri ? __( '[inline image]', 'bouquet-customizer-pro' ) : esc_url_raw( $preview );
            echo "\n" . $label . ': ' . $value . "\n";
            return;
        }

        $src = $is_data_uri ? esc_attr( $preview ) : esc_url( $preview );

        echo '<div class="bq-order-preview-meta">';
        echo '<strong>' . esc_html( $label ) . '</strong><br />';
        echo '<img src="' . $src . '" alt="' . esc_attr__( 'Bouquet preview image', 'bouquet-customizer-pro' ) . '" style="max-width:220px;border:1px solid #d5dbe4;border-radius:6px;padding:4px;margin-top:6px;" />';
        echo '</div>';
    }

    /**
     * Convert selected options array into human summary.
     *
     * @param array $selected
     * @return string
     */
    private function format_selection_summary( $selected ) {
        if ( empty( $selected ) || ! is_array( $selected ) ) {
            return '';
        }

        $lines = [];
        foreach ( $selected as $choice ) {
            $step  = sanitize_text_field( $choice['stepTitle'] ?? '' );
            $label = sanitize_text_field( $choice['optionTitle'] ?? '' );
            $custom_val = isset( $choice['customValue'] )
                ? sanitize_text_field( $choice['customValue'] )
                : ( isset( $choice['custom_value'] ) ? sanitize_text_field( $choice['custom_value'] ) : '' );
            if ( $custom_val ) {
                $label .= ' (' . $custom_val . ')';
            }
            if ( ! $step && ! $label ) {
                continue;
            }
            $lines[] = trim( $step . ': ' . $label );
        }

        return implode( "\n", $lines );
    }

    /**
     * Allow data URLs or absolute URLs for previews without corrupting base64.
     *
     * @param string $value
     * @return string
     */
    private function sanitize_preview_payload( $value ) {
        if ( ! is_string( $value ) ) {
            return '';
        }
        $value = trim( $value );
        if ( 0 === strpos( $value, 'data:image' ) ) {
            return $value;
        }
        return esc_url_raw( $value );
    }

    /**
     * Persist preview image to the uploads directory.
     *
     * @param string $data_url
     * @return array|false
     */
    private function store_preview_image( $data_url ) {
        if ( ! is_string( $data_url ) || false === strpos( $data_url, 'data:image' ) ) {
            return false;
        }

        if ( ! preg_match( '/^data:image\/(png|jpe?g);base64,/', $data_url, $matches ) ) {
            return false;
        }

        $extension = 'png';
        if ( isset( $matches[1] ) && in_array( strtolower( $matches[1] ), [ 'jpg', 'jpeg' ], true ) ) {
            $extension = 'jpg';
        }

        $image_data = substr( $data_url, strpos( $data_url, ',' ) + 1 );
        $image_data = base64_decode( $image_data );
        if ( ! $image_data ) {
            return false;
        }

        $filename = 'bouquet-preview-' . time() . '-' . wp_generate_password( 6, false ) . '.' . $extension;
        $upload   = wp_upload_bits( $filename, '', $image_data );

        if ( ! empty( $upload['error'] ) ) {
            return false;
        }

        if ( ! function_exists( 'wp_insert_attachment' ) ) {
            require_once ABSPATH . 'wp-admin/includes/file.php';
            require_once ABSPATH . 'wp-admin/includes/image.php';
            require_once ABSPATH . 'wp-admin/includes/media.php';
        }

        $attachment_id = 0;
        $filetype      = wp_check_filetype( $filename, null );
        $attachment_id = wp_insert_attachment(
            [
                'post_mime_type' => $filetype['type'] ?? 'image/png',
                'post_title'     => sanitize_file_name( pathinfo( $filename, PATHINFO_FILENAME ) ),
                'post_content'   => '',
                'post_status'    => 'inherit',
            ],
            $upload['file']
        );

        if ( $attachment_id && ! is_wp_error( $attachment_id ) ) {
            $metadata = wp_generate_attachment_metadata( $attachment_id, $upload['file'] );
            wp_update_attachment_metadata( $attachment_id, $metadata );
        } else {
            $attachment_id = 0;
        }

        return [
            'url'           => $upload['url'],
            'attachment_id' => $attachment_id,
        ];
    }
}
