<?php
/**
 * Plugin Name: Bouquet Customizer Pro
 * Description: Dynamic WooCommerce bouquet builder with layered PNG preview.
 * Version: 2.0.2
 * Author: On Virtual World Team
 * Text Domain: bouquet-customizer-pro
 * Domain Path: GitHub Plugin URI: ShowrabM/Bouquet-Customizer-Pro
 */

defined( 'ABSPATH' ) || exit;

define( 'BQP_FILE', __FILE__ );
define( 'BQP_PATH', untrailingslashit( plugin_dir_path( __FILE__ ) ) );
define( 'BQP_URL', untrailingslashit( plugin_dir_url( __FILE__ ) ) );
define( 'BQP_PREVIEW_META_KEY', '_bq_preview_image' );
define( 'BQP_TEMPLATE_META_KEY', '_bq_full_canvas_template' );

$plugin_data = get_file_data(
    __FILE__,
    [
        'Version' => 'Version',
    ]
);

define( 'BQP_VERSION', ! empty( $plugin_data['Version'] ) ? $plugin_data['Version'] : '2.0.2' );

require_once BQP_PATH . '/includes/class-bouquet-admin.php';
require_once BQP_PATH . '/includes/class-bouquet-frontend.php';
require_once BQP_PATH . '/includes/class-bouquet-api.php';

/**
 * Build a cache-busting asset version string.
 *
 * @param string $relative_path
 * @return string
 */
function bq_get_asset_version( $relative_path = '' ) {
    $version = BQP_VERSION;

    if ( ! $relative_path ) {
        return $version;
    }

    $file_path = BQP_PATH . '/' . ltrim( $relative_path, '/' );
    if ( file_exists( $file_path ) ) {
        $mtime = filemtime( $file_path );
        if ( $mtime ) {
            return $version . '-' . $mtime;
        }
    }

    return $version;
}

/**
 * Activation tasks: create custom tables.
 */
function bq_activate_plugin() {
    global $wpdb;
    $table_name = $wpdb->prefix . 'bq_custom_groups';
    $charset_collate = $wpdb->get_charset_collate();

    $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        product_id BIGINT(20) UNSIGNED NOT NULL,
        config LONGTEXT NOT NULL,
        created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY product_id (product_id)
    ) {$charset_collate};";

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta( $sql );
}

register_activation_hook( __FILE__, 'bq_activate_plugin' );

/**
 * Retrieve a configuration for a product.
 *
 * @param int $product_id
 * @return array|null
 */
function bq_get_product_config( $product_id ) {
    $product_id = absint( $product_id );
    if ( ! $product_id ) {
        return null;
    }

    $cache_key = 'bq_product_config_' . $product_id;
    $found     = null;
    $cached    = function_exists( 'wp_cache_get' )
        ? wp_cache_get( $cache_key, 'bq_customizer', false, $found )
        : false;
    if ( $found ) {
        return $cached;
    }

    global $wpdb;
    $table = $wpdb->prefix . 'bq_custom_groups';
    $row   = $wpdb->get_row(
        $wpdb->prepare(
            "SELECT * FROM {$table} WHERE product_id = %d ORDER BY id DESC LIMIT 1",
            $product_id
        )
    );

    if ( ! $row ) {
        if ( function_exists( 'wp_cache_set' ) ) {
            wp_cache_set( $cache_key, null, 'bq_customizer', HOUR_IN_SECONDS );
        }
        return null;
    }

    $config = json_decode( $row->config, true );
    if ( ! is_array( $config ) ) {
        if ( function_exists( 'wp_cache_set' ) ) {
            wp_cache_set( $cache_key, null, 'bq_customizer', HOUR_IN_SECONDS );
        }
        return null;
    }

    $config = bq_normalize_config_structure( $config );
    $config = array_merge(
        [ 'group_id' => (int) $row->id ],
        $config
    );

    if ( function_exists( 'wp_cache_set' ) ) {
        wp_cache_set( $cache_key, $config, 'bq_customizer', HOUR_IN_SECONDS );
    }

    return $config;
}

/**
 * Save or update a group configuration.
 *
 * @param int   $product_id
 * @param array $config
 */
function bq_save_product_config( $product_id, $config ) {
    global $wpdb;
    $table = $wpdb->prefix . 'bq_custom_groups';
    $row = $wpdb->get_row(
        $wpdb->prepare(
            "SELECT id FROM {$table} WHERE product_id = %d ORDER BY id DESC LIMIT 1",
            $product_id
        )
    );

    $data = [
        'product_id' => $product_id,
        'config'     => wp_json_encode( $config ),
    ];

    if ( $row ) {
        $wpdb->update( $table, $data, [ 'id' => $row->id ] );
    } else {
        $wpdb->insert( $table, $data );
    }

    bq_clear_product_config_cache( $product_id );
    bq_clear_saved_configs_cache();
}

/**
 * Provide helper to check if product has configuration.
 *
 * @param int $product_id
 * @return bool
 */
function bq_product_has_config( $product_id ) {
    return (bool) bq_get_product_config( $product_id );
}

/**
 * Clear the cached configuration for a product.
 *
 * @param int $product_id
 * @return void
 */
function bq_clear_product_config_cache( $product_id ) {
    if ( ! function_exists( 'wp_cache_delete' ) ) {
        return;
    }
    $product_id = absint( $product_id );
    if ( ! $product_id ) {
        return;
    }
    wp_cache_delete( 'bq_product_config_' . $product_id, 'bq_customizer' );
}

/**
 * Clear the cached list of saved configurations.
 *
 * @return void
 */
function bq_clear_saved_configs_cache() {
    if ( function_exists( 'wp_cache_delete' ) ) {
        wp_cache_delete( 'bq_saved_configs', 'bq_customizer' );
    }
}

/**
 * Normalize legacy configuration structures for consistent front-end output.
 *
 * @param array $config
 * @return array
 */
function bq_normalize_config_structure( $config ) {
    if ( ! is_array( $config ) ) {
        return [];
    }

    if ( empty( $config['steps'] ) || ! is_array( $config['steps'] ) ) {
        $config['steps'] = [];
        return $config;
    }

    foreach ( $config['steps'] as $step_index => $step ) {
        if ( ! is_array( $step ) ) {
            $config['steps'][ $step_index ] = [];
            continue;
        }

        $input_type    = sanitize_key( $step['input_type'] ?? 'radio' );
        $allowed_types = [ 'radio', 'checkboxes', 'image_buttons', 'text_input', 'text_label', 'custom_price' ];
        if ( ! in_array( $input_type, $allowed_types, true ) ) {
            $input_type = 'radio';
        }

        $selection = in_array( $step['selection'] ?? 'single', [ 'single', 'multiple' ], true ) ? $step['selection'] : 'single';
        if ( 'checkboxes' === $input_type ) {
            $selection = 'multiple';
        } elseif ( in_array( $input_type, [ 'text_input', 'text_label', 'custom_price' ], true ) ) {
            $selection = 'single';
        }
        $max_selections = 0;
        if ( isset( $step['max_selections'] ) || isset( $step['maxSelections'] ) || isset( $step['maxSelection'] ) ) {
            $max_raw       = $step['max_selections'] ?? ( $step['maxSelections'] ?? ( $step['maxSelection'] ?? 0 ) );
            $max_selections = absint( $max_raw );
        }
        if ( 'multiple' !== $selection ) {
            $max_selections = 1;
        }

        $choice_source = in_array( $step['choice_source'] ?? 'custom', [ 'custom', 'attribute' ], true ) ? $step['choice_source'] : 'custom';
        $attribute     = 'attribute' === $choice_source ? sanitize_title( $step['attribute'] ?? '' ) : '';

        $config['steps'][ $step_index ]['selection']     = $selection;
        $config['steps'][ $step_index ]['input_type']    = $input_type;
        $config['steps'][ $step_index ]['max_selections'] = $max_selections;
        $config['steps'][ $step_index ]['choice_source'] = $choice_source;
        $config['steps'][ $step_index ]['attribute']     = $attribute;
        $config['steps'][ $step_index ]['required']      = ! empty( $step['required'] );

        $raw_dependency_rules = $step['dependency_rules'] ?? null;
        $dependency_keys      = [ 'dependencyRules', 'conditional_rules', 'conditionalRules', 'conditions', 'condition_rules' ];
        foreach ( $dependency_keys as $dependency_key ) {
            if ( ! empty( $step[ $dependency_key ] ) ) {
                $raw_dependency_rules = $step[ $dependency_key ];
                break;
            }
        }
        if ( null === $raw_dependency_rules ) {
            $raw_dependency_rules = [];
        }

        $legacy_dependency = $step['dependency'] ?? '';
        $legacy_keys       = [ 'condition', 'conditional', 'legacy_dependency' ];
        foreach ( $legacy_keys as $legacy_key ) {
            if ( ! empty( $step[ $legacy_key ] ) ) {
                $legacy_dependency = $step[ $legacy_key ];
                break;
            }
        }

        $operator = $step['dependency_operator'] ?? ( $step['dependencyOperator'] ?? ( $step['conditional_operator'] ?? 'all' ) );
        $operator = sanitize_key( $operator );
        if ( ! in_array( $operator, [ 'all', 'any' ], true ) ) {
            $operator = 'all';
        }

        $config['steps'][ $step_index ]['dependency_operator'] = $operator;
        $config['steps'][ $step_index ]['dependency_rules']    = bq_normalize_dependency_rules( $raw_dependency_rules, $legacy_dependency );

        if ( empty( $step['options'] ) || ! is_array( $step['options'] ) ) {
            $config['steps'][ $step_index ]['options'] = [];
            continue;
        }

		foreach ( $step['options'] as $option_index => $option ) {
			if ( ! is_array( $option ) ) {
				$config['steps'][ $step_index ]['options'][ $option_index ] = [];
				continue;
			}

			$display_image = isset( $option['display_image'] ) ? esc_url_raw( $option['display_image'] ) : '';
			$layers        = bq_normalize_layer_collection( $option['layers'] ?? [] );
			if ( empty( $layers ) && $display_image ) {
				$layers[] = [
					'url'         => $display_image,
					'price_delta' => 0,
				];
			}

			$config['steps'][ $step_index ]['options'][ $option_index ]['layers']      = $layers;
			$config['steps'][ $step_index ]['options'][ $option_index ]['price_type']  = bq_normalize_price_type( $option['price_type'] ?? 'none' );
			$config['steps'][ $step_index ]['options'][ $option_index ]['price_value'] = bq_extract_price_from_source( $option['price_value'] ?? ( $option['price_delta'] ?? 0 ) );
			$config['steps'][ $step_index ]['options'][ $option_index ]['price_delta'] = bq_extract_price_from_source( $option, isset( $option['price_delta'] ) ? $option['price_delta'] : 0 );
			$config['steps'][ $step_index ]['options'][ $option_index ]['skip_layers'] = ! empty( $option['skip_layers'] );
		}

        if ( 'text_label' === $input_type && empty( $config['steps'][ $step_index ]['options'] ) ) {
            $config['steps'][ $step_index ]['options'][] = [
                'title'           => '',
                'price_delta'   => 0,
                'price_type'    => 'none',
                'price_value'   => 0,
                'layers'        => [],
                'skip_layers'   => true,
			];
		}
    }

    return $config;
}

/**
 * Convert arbitrary layer collections into normalized arrays.
 *
 * @param mixed $raw_layers
 * @return array
 */
function bq_normalize_layer_collection( $raw_layers ) {
    if ( is_string( $raw_layers ) ) {
        $decoded = json_decode( $raw_layers, true );
        if ( is_array( $decoded ) ) {
            $raw_layers = $decoded;
        } else {
            // Attempt comma-separated fallback.
            $parts = array_map( 'trim', explode( ',', $raw_layers ) );
            $raw_layers = $parts;
        }
    } elseif ( $raw_layers instanceof stdClass ) {
        $raw_layers = (array) $raw_layers;
    }

    if ( is_numeric( $raw_layers ) ) {
        $raw_layers = [ $raw_layers ];
    }

    if ( ! is_array( $raw_layers ) ) {
        return [];
    }

    $normalized = [];
    foreach ( $raw_layers as $layer ) {
        $maybe = bq_normalize_single_layer_entry( $layer );
        if ( $maybe ) {
            $normalized[] = $maybe;
        }
    }

    return $normalized;
}

/**
 * Normalize a single layer entry to url + price pair.
 *
 * @param mixed $layer
 * @return array|null
 */
function bq_normalize_single_layer_entry( $layer ) {
    if ( is_object( $layer ) ) {
        $layer = (array) $layer;
    }

    $url   = '';
    $price = 0.0;

    if ( is_string( $layer ) ) {
        $maybe_json = json_decode( $layer, true );
        if ( is_array( $maybe_json ) ) {
            $layer = $maybe_json;
        } else {
            $url = esc_url_raw( $layer );
        }
    }

    if ( is_numeric( $layer ) ) {
        $url = bq_get_attachment_url_from_value( $layer );
    } elseif ( is_array( $layer ) ) {
        $url_keys = [ 'url', 'image', 'src', 'image_url', 'imageUrl', 'layer_url', 'layerUrl', 'link', 'value', 'path' ];
        foreach ( $url_keys as $key ) {
            if ( ! empty( $layer[ $key ] ) ) {
                $candidate = esc_url_raw( $layer[ $key ] );
                if ( $candidate ) {
                    $url = $candidate;
                    break;
                }
            }
        }

        if ( ! $url ) {
            $id_keys = [ 'attachment_id', 'attachment', 'id', 'image_id', 'media_id' ];
            foreach ( $id_keys as $key ) {
                if ( empty( $layer[ $key ] ) ) {
                    continue;
                }
                $url = bq_get_attachment_url_from_value( $layer[ $key ] );
                if ( $url ) {
                    break;
                }
            }
        }

        $price = bq_extract_price_from_source( $layer );
    }

    if ( ! $url ) {
        // Fallback: keep a sanitized string so imports with missing media still retain structure.
        if ( is_array( $layer ) ) {
            $raw_fallback_keys = [ 'url', 'path', 'value', 'image', 'src' ];
            foreach ( $raw_fallback_keys as $key ) {
                if ( ! empty( $layer[ $key ] ) && is_string( $layer[ $key ] ) ) {
                    $url = sanitize_text_field( $layer[ $key ] );
                    break;
                }
            }
            if ( ! $url && ! empty( $layer['id'] ) ) {
                $url = 'attachment://' . absint( $layer['id'] );
            }
        } elseif ( is_string( $layer ) ) {
            $url = sanitize_text_field( $layer );
        }
    }

    if ( ! $url ) {
        // As a last resort, keep a placeholder rather than dropping the layer entirely.
        $url = 'bq-missing-media';
    }

    return [
        'url'         => $url,
        'price_delta' => $price,
    ];
}

/**
 * Extract numeric price from heterogeneous sources.
 *
 * @param mixed $source
 * @param float $fallback
 * @return float
 */
function bq_extract_price_from_source( $source, $fallback = 0.0 ) {
    if ( is_array( $source ) || $source instanceof stdClass ) {
        $source    = (array) $source;
        $price_keys = [ 'price_delta', 'priceDelta', 'price', 'delta', 'cost', 'amount' ];
        foreach ( $price_keys as $key ) {
            if ( isset( $source[ $key ] ) && '' !== $source[ $key ] ) {
                return floatval( $source[ $key ] );
            }
        }

        return floatval( $fallback );
    }

    if ( is_numeric( $source ) ) {
        return floatval( $source );
    }

    if ( is_scalar( $source ) && '' !== $source ) {
        return floatval( $source );
    }

    return floatval( $fallback );
}

/**
 * Resolve a URL from an attachment identifier.
 *
 * @param mixed $value
 * @return string
 */
function bq_get_attachment_url_from_value( $value ) {
    $attachment_id = is_numeric( $value ) ? absint( $value ) : 0;
    if ( ! $attachment_id ) {
        return '';
    }

    if ( function_exists( 'wp_get_attachment_url' ) ) {
        $url = wp_get_attachment_url( $attachment_id );
        if ( $url ) {
            return esc_url_raw( $url );
        }
    }

    return '';
}

/**
 * Sanitize and normalize the stored price type.
 *
 * @param string $value
 * @return string
 */
function bq_normalize_price_type( $value ) {
    $value   = sanitize_key( $value );
    $allowed = [ 'none', 'fixed', 'percentage', 'quantity', 'custom' ];
    if ( ! in_array( $value, $allowed, true ) ) {
        return 'none';
    }

    return $value;
}

/**
 * Extract a dependency index from multiple key names.
 *
 * @param array $rule
 * @param array $keys
 * @return int
 */
function bq_extract_dependency_index( $rule, $keys, $allow_any = false ) {
    foreach ( $keys as $key ) {
        if ( ! isset( $rule[ $key ] ) || '' === $rule[ $key ] ) {
            continue;
        }

        $value = $rule[ $key ];
        if ( $allow_any && is_string( $value ) && 'any' === strtolower( $value ) ) {
            return 'any';
        }

        return absint( $value );
    }

    return -1;
}

/**
 * Normalize stored dependency rules, with legacy fallback.
 *
 * @param mixed  $rules
 * @param string $legacy
 * @return array
 */
function bq_normalize_dependency_rules( $rules, $legacy = '' ) {
    if ( $rules instanceof stdClass ) {
        $rules = (array) $rules;
    }

    if ( is_string( $rules ) ) {
        $decoded = json_decode( $rules, true );
        if ( is_array( $decoded ) ) {
            $rules = $decoded;
        }
    }

    if ( ! is_array( $rules ) ) {
        $rules = [];
    }

    $out = [];
    foreach ( $rules as $rule ) {
        if ( is_string( $rule ) ) {
            $inline = bq_parse_dependency_string( $rule );
            if ( $inline ) {
                $out[] = $inline;
            }
            continue;
        }

        if ( ! is_array( $rule ) ) {
            continue;
        }

        $step_keys   = [ 'step', 'step_index', 'stepIndex', 'step_id', 'stepId', 'parent_step', 'parentStep' ];
        $option_keys = [ 'option', 'option_index', 'optionIndex', 'option_id', 'optionId', 'choice', 'choice_index', 'choiceIndex' ];

        $step = bq_extract_dependency_index( $rule, $step_keys );
        if ( $step < 0 ) {
            continue;
        }
        $option = bq_extract_dependency_index( $rule, $option_keys, true );
        if ( 'any' !== $option && $option < 0 ) {
            continue;
        }

        $out[] = [
            'step'   => $step,
            'option' => $option,
        ];
    }

    if ( empty( $out ) && $legacy ) {
        $legacy_rule = bq_parse_dependency_string( $legacy );
        if ( $legacy_rule ) {
            $out[] = $legacy_rule;
        }
    }

    return $out;
}

/**
 * Convert legacy "step:option" string to structured array.
 *
 * @param string $value
 * @return array|null
 */
function bq_parse_dependency_string( $value ) {
    if ( ! is_string( $value ) ) {
        return null;
    }

    if ( ! preg_match( '/^(\d+):(any|\d+)$/i', $value, $matches ) ) {
        return null;
    }

    $step = absint( $matches[1] );
    $option_raw = $matches[2];
    $option = ( 'any' === strtolower( $option_raw ) ) ? 'any' : absint( $option_raw );

    return [
        'step'   => $step,
        'option' => $option,
    ];
}

/**
 * Verify REST nonce with multiple fallbacks.
 *
 * @param string $nonce
 * @return bool
 */
function bq_verify_rest_nonce( $nonce ) {
    if ( ! $nonce ) {
        return false;
    }

    if ( wp_verify_nonce( $nonce, 'bq_rest_nonce' ) ) {
        return true;
    }

    if ( wp_verify_nonce( $nonce, 'wp_rest' ) ) {
        return true;
    }

    return false;
}

/**
 * Initialize plugin classes.
 */
function bq_init_plugin() {
    new Bouquet_Customizer_Admin();
    new Bouquet_Customizer_Frontend();
    new Bouquet_Customizer_API();
}

add_action( 'plugins_loaded', 'bq_init_plugin' );
