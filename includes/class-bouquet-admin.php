<?php
defined( 'ABSPATH' ) || exit;

class Bouquet_Customizer_Admin {
    /**
     * Track saved configs for JavaScript.
     *
     * @var array
     */
    private $configs = [];

    public function __construct() {
        add_action( 'admin_menu', [ $this, 'register_menu' ] );
        add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_assets' ] );
        add_action( 'add_meta_boxes', [ $this, 'register_template_meta_box' ] );
        add_action( 'save_post_product', [ $this, 'save_template_meta_box' ] );
        add_action( 'admin_post_bq_export_configs', [ $this, 'handle_export' ] );
        add_action( 'admin_post_bq_import_configs', [ $this, 'handle_import' ] );
    }

    /**
     * Stream JSON export to the browser.
     */
    public function handle_export() {
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( esc_html__( 'You do not have permission to export configurations.', 'bouquet-customizer-pro' ) );
        }

        check_admin_referer( 'bq_export_configs', 'bq_export_nonce' );

        $payload  = $this->get_all_configurations_for_export();
        $filename = 'bouquet-configs-' . gmdate( 'Y-m-d-H-i-s' ) . '.json';

        nocache_headers();
        header( 'Content-Type: application/json; charset=utf-8' );
        header( 'Content-Disposition: attachment; filename="' . $filename . '"' );
        echo wp_json_encode( $payload );
        exit;
    }

    /**
     * Process uploaded JSON file and store configs.
     */
    public function handle_import() {
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( esc_html__( 'You do not have permission to import configurations.', 'bouquet-customizer-pro' ) );
        }

        check_admin_referer( 'bq_import_configs', 'bq_import_nonce' );

        if ( empty( $_FILES['bq_import_file'] ) ) {
            $this->redirect_with_notice(
                'import_error',
                [ 'error' => __( 'Upload a JSON file to import.', 'bouquet-customizer-pro' ) ]
            );
        }

        $file = $_FILES['bq_import_file'];
        if ( ! empty( $file['error'] ) && UPLOAD_ERR_OK !== (int) $file['error'] ) {
            $this->redirect_with_notice(
                'import_error',
                [ 'error' => __( 'File upload failed. Please try again.', 'bouquet-customizer-pro' ) ]
            );
        }

        $contents = file_get_contents( $file['tmp_name'] );
        if ( ! $contents ) {
            $this->redirect_with_notice(
                'import_error',
                [ 'error' => __( 'Unable to read the uploaded file.', 'bouquet-customizer-pro' ) ]
            );
        }

        $data = json_decode( $contents, true );
        if ( ! is_array( $data ) ) {
            $this->redirect_with_notice(
                'import_error',
                [ 'error' => __( 'Uploaded file does not contain valid JSON.', 'bouquet-customizer-pro' ) ]
            );
        }

        $items = [];
        if ( isset( $data['items'] ) && is_array( $data['items'] ) ) {
            $items = $data['items'];
        } elseif ( isset( $data[0] ) ) {
            $items = $data;
        }

        if ( empty( $items ) ) {
            $this->redirect_with_notice(
                'import_error',
                [ 'error' => __( 'No configurations found in this file.', 'bouquet-customizer-pro' ) ]
            );
        }

        $imported = 0;
        $skipped  = 0;

        foreach ( $items as $item ) {
            if ( ! is_array( $item ) ) {
                $skipped++;
                continue;
            }

            $product_id = $this->locate_product_id_from_item( $item );
            if ( ! $product_id ) {
                $skipped++;
                continue;
            }

            $config = $item['config'] ?? [];
            if ( empty( $config['steps'] ) && isset( $item['steps'] ) ) {
                $config['steps'] = $item['steps'];
            }
            $steps = $this->sanitize_steps( $config['steps'] ?? [] );
            if ( empty( $steps ) ) {
                $skipped++;
                continue;
            }

            bq_save_product_config(
                $product_id,
                [
                    'steps' => $steps,
                ]
            );
            $imported++;
        }

        if ( $imported > 0 ) {
            $this->redirect_with_notice(
                'import_success',
                [
                    'count'  => $imported,
                    'failed' => max( 0, $skipped ),
                ]
            );
        }

        $this->redirect_with_notice(
            'import_error',
            [ 'error' => __( 'No valid bouquet data could be imported.', 'bouquet-customizer-pro' ) ]
        );
    }

    /**
     * Register submenu page under WooCommerce.
     */
    public function register_menu() {
        add_submenu_page(
            'woocommerce',
            __( 'Bouquet Customizer', 'bouquet-customizer-pro' ),
            __( 'Bouquet Customizer', 'bouquet-customizer-pro' ),
            'manage_woocommerce',
            'bq-customizer',
            [ $this, 'render_page' ]
        );
    }

    /**
     * Load CSS/JS for the admin page.
     *
     * @param string $hook
     */
    public function enqueue_assets( $hook ) {
        if ( 'woocommerce_page_bq-customizer' !== $hook ) {
            return;
        }

        wp_enqueue_style(
            'bq-admin-style',
            BQP_URL . '/assets/css/admin-options.css',
            [],
            bq_get_asset_version( 'assets/css/admin-options.css' )
        );
        wp_enqueue_style( 'dashicons' );
        wp_enqueue_script( 'jquery-ui-sortable' );
        wp_enqueue_script(
            'bq-admin-script',
            BQP_URL . '/assets/js/admin-options.js',
            [ 'jquery', 'jquery-ui-sortable' ],
            bq_get_asset_version( 'assets/js/admin-options.js' ),
            true
        );
        wp_enqueue_media();

        wp_localize_script(
            'bq-admin-script',
            'bqAdminData',
            $this->get_admin_script_data()
        );
    }

    /**
     * Add a meta box to toggle the full-canvas product template.
     */
    public function register_template_meta_box() {
        add_meta_box(
            'bq-full-canvas-template',
            __( 'Bouquet Full Canvas Template', 'bouquet-customizer-pro' ),
            [ $this, 'render_template_meta_box' ],
            'product',
            'side',
            'default'
        );
    }

    /**
     * Render the template selector box.
     *
     * @param WP_Post $post
     */
    public function render_template_meta_box( $post ) {
        $checked = get_post_meta( $post->ID, BQP_TEMPLATE_META_KEY, true ) === '1';
        wp_nonce_field( 'bq_template_meta', 'bq_template_meta_nonce' );
        ?>
        <p><?php esc_html_e( 'Use a clean, WooCommerce-safe canvas layout that removes theme wrappers. Great for Elementor-style full-width pages.', 'bouquet-customizer-pro' ); ?></p>
        <label>
            <input type="checkbox" name="bq_full_canvas_template" value="1" <?php checked( $checked ); ?> />
            <?php esc_html_e( 'Enable Bouquet Full Canvas template', 'bouquet-customizer-pro' ); ?>
        </label>
        <?php
    }

    /**
     * Save template selection.
     *
     * @param int $post_id
     * @return void
     */
    public function save_template_meta_box( $post_id ) {
        if ( ! isset( $_POST['bq_template_meta_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['bq_template_meta_nonce'] ) ), 'bq_template_meta' ) ) {
            return;
        }
        if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
            return;
        }
        if ( ! current_user_can( 'edit_post', $post_id ) ) {
            return;
        }

        $value = isset( $_POST['bq_full_canvas_template'] ) ? '1' : '';
        if ( $value ) {
            update_post_meta( $post_id, BQP_TEMPLATE_META_KEY, $value );
        } else {
            delete_post_meta( $post_id, BQP_TEMPLATE_META_KEY );
        }
    }

    /**
     * Output settings area for managing bouquets.
     */
    public function render_page() {
        $message = '';
        $notice_class = 'notice notice-success';
        if ( isset( $_POST['bq_delete_config'], $_POST['bq_delete_id'] ) && check_admin_referer( 'bq_delete_config', 'bq_delete_nonce' ) ) {
            $deleted = $this->delete_configuration( absint( wp_unslash( $_POST['bq_delete_id'] ) ) );
            if ( $deleted ) {
                $message = __( 'Configuration removed.', 'bouquet-customizer-pro' );
            } else {
                $message = __( 'Unable to delete configuration.', 'bouquet-customizer-pro' );
                $notice_class = 'notice notice-error';
            }
        } elseif ( isset( $_POST['bq_save_config'] ) && check_admin_referer( 'bq_save_config', 'bq_nonce' ) ) {
            $product_id = absint( wp_unslash( $_POST['bq_product_id'] ?? 0 ) );
            $steps_raw  = $this->extract_steps_payload( $_POST );
            $steps      = $this->sanitize_steps( $steps_raw );
            if ( $product_id && ! empty( $steps ) ) {
                bq_save_product_config(
                    $product_id,
                    [
                        'steps' => $steps,
                    ]
                );
                $message = __( 'Configuration saved.', 'bouquet-customizer-pro' );
            } else {
                $message = __( 'Select a product and add at least one step.', 'bouquet-customizer-pro' );
                $notice_class = 'notice notice-error';
            }
        } else {
            $notice = $this->get_notice_from_request();
            if ( $notice ) {
                $message      = $notice['message'];
                $notice_class = $notice['class'];
            }
        }

        $products = $this->get_product_options();
        $saved = $this->get_saved_configurations();

        wp_localize_script(
            'bq-admin-script',
            'bqAdminData',
            $this->get_admin_script_data( $saved )
        );
        ?>
        <div class="wrap bq-admin-wrap">
            <h1><?php esc_html_e( 'Bouquet Customizer', 'bouquet-customizer-pro' ); ?></h1>
            <p class="bq-subtitle"><?php esc_html_e( 'Craft layered bouquets by defining steps, options, and PNG stacks linked to WooCommerce products.', 'bouquet-customizer-pro' ); ?></p>
            <?php if ( $message ) : ?>
                <div class="<?php echo esc_attr( $notice_class ); ?> is-dismissible">
                    <p><?php echo esc_html( $message ); ?></p>
                </div>
            <?php endif; ?>
            <div class="bq-admin-grid">
                <div class="bq-card bq-builder-card">
                    <form method="post" class="bq-config-form">
                        <?php wp_nonce_field( 'bq_save_config', 'bq_nonce' ); ?>
                        <input type="hidden" name="bq_steps_payload" id="bq-steps-payload" value="" />
                        <table class="form-table">
                            <tr>
                                <th><label for="bq-product-id"><?php esc_html_e( 'WooCommerce Product', 'bouquet-customizer-pro' ); ?></label></th>
                                <td>
                                    <select name="bq_product_id" id="bq-product-id">
                                        <option value="0"><?php esc_html_e( 'Select a product', 'bouquet-customizer-pro' ); ?></option>
                                        <?php foreach ( $products as $id => $title ) : ?>
                                            <option value="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $title ); ?></option>
                                        <?php endforeach; ?>
                                    </select>
                                    <p class="description"><?php esc_html_e( 'Attach a customization blueprint to a specific product.', 'bouquet-customizer-pro' ); ?></p>
                                </td>
                            </tr>
                        </table>

                        <div class="bq-steps-toolbar">
                            <div>
                                <h2><?php esc_html_e( 'Customization Flow', 'bouquet-customizer-pro' ); ?></h2>
                                <p><?php esc_html_e( 'Each step represents one customer choice (base, flowers, wrap, accents…).', 'bouquet-customizer-pro' ); ?></p>
                            </div>
                            <button type="button" class="button button-secondary" id="bq-add-step">
                                <?php esc_html_e( 'Add Step', 'bouquet-customizer-pro' ); ?>
                            </button>
                        </div>
                        <div id="bq-steps" class="bq-steps"></div>
                        <div class="bq-submit-row">
                            <button type="submit" name="bq_save_config" class="button button-primary button-hero"><?php esc_html_e( 'Save Customization', 'bouquet-customizer-pro' ); ?></button>
                        </div>
                    </form>
                </div>
            </div>
            <details class="bq-advanced-panel">
                <summary><?php esc_html_e( 'Saved configurations & tools', 'bouquet-customizer-pro' ); ?></summary>
                <div class="bq-advanced-body">
                    <section class="bq-existing-configs">
                        <h2><?php esc_html_e( 'Saved Configurations', 'bouquet-customizer-pro' ); ?></h2>
                        <p class="description"><?php esc_html_e( 'Reuse or tweak an existing bouquet recipe.', 'bouquet-customizer-pro' ); ?></p>
                        <ul class="bq-config-list">
                            <?php if ( empty( $saved ) ) : ?>
                                <li class="bq-config-list__item is-empty"><?php esc_html_e( 'No saved configurations yet.', 'bouquet-customizer-pro' ); ?></li>
                            <?php else : ?>
                                <?php foreach ( $saved as $config ) : ?>
                                    <li class="bq-config-list__item">
                                        <div class="bq-config-list__meta">
                                            <span class="bq-config-list__name">
                                                <?php
                                                echo esc_html(
                                                    $config['product_title']
                                                    ? $config['product_title']
                                                    : sprintf(
                                                        __( 'Product #%d', 'bouquet-customizer-pro' ),
                                                        $config['product_id']
                                                    )
                                                );
                                                ?>
                                            </span>
                                            <span class="bq-config-list__badge">
                                                <?php
                                                printf(
                                                    _n( '%d step', '%d steps', $config['step_count'], 'bouquet-customizer-pro' ),
                                                    $config['step_count']
                                                );
                                                ?>
                                            </span>
                                        </div>
                                        <div class="bq-config-list__actions">
                                            <button type="button" class="button bq-load-config" data-config="<?php echo esc_attr( wp_json_encode( $config ) ); ?>">
                                                <?php esc_html_e( 'Load in Builder', 'bouquet-customizer-pro' ); ?>
                                            </button>
                                            <form method="post" class="bq-config-delete-form" onsubmit="return confirm('<?php echo esc_js( __( 'Delete this configuration?', 'bouquet-customizer-pro' ) ); ?>');">
                                                <?php wp_nonce_field( 'bq_delete_config', 'bq_delete_nonce' ); ?>
                                                <input type="hidden" name="bq_delete_id" value="<?php echo esc_attr( $config['group_id'] ); ?>" />
                                                <button type="submit" name="bq_delete_config" class="button-link-delete">
                                                    <?php esc_html_e( 'Delete', 'bouquet-customizer-pro' ); ?>
                                                </button>
                                            </form>
                                            <span class="bq-config-list__id"><?php printf( __( 'Product #%d', 'bouquet-customizer-pro' ), $config['product_id'] ); ?></span>
                                        </div>
                                    </li>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </ul>
                    </section>
                    <section class="bq-import-export">
                        <h2><?php esc_html_e( 'Export &amp; Import', 'bouquet-customizer-pro' ); ?></h2>
                        <p class="description"><?php esc_html_e( 'Download a JSON backup of your bouquet flows or import one from another site.', 'bouquet-customizer-pro' ); ?></p>
                        <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="bq-export-form">
                            <?php wp_nonce_field( 'bq_export_configs', 'bq_export_nonce' ); ?>
                            <input type="hidden" name="action" value="bq_export_configs" />
                            <button type="submit" class="button"><?php esc_html_e( 'Export Configurations', 'bouquet-customizer-pro' ); ?></button>
                        </form>
                        <form method="post" enctype="multipart/form-data" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="bq-import-form">
                            <?php wp_nonce_field( 'bq_import_configs', 'bq_import_nonce' ); ?>
                            <input type="hidden" name="action" value="bq_import_configs" />
                            <label for="bq-import-file" class="screen-reader-text"><?php esc_html_e( 'Select JSON file to import', 'bouquet-customizer-pro' ); ?></label>
                            <input type="file" id="bq-import-file" name="bq_import_file" accept="application/json,.json" required />
                            <p class="description"><?php esc_html_e( 'Matches products by ID, SKU, or slug when available.', 'bouquet-customizer-pro' ); ?></p>
                            <button type="submit" class="button button-secondary"><?php esc_html_e( 'Import File', 'bouquet-customizer-pro' ); ?></button>
                        </form>
                    </section>
                </div>
            </details>
        </div>
        <?php
    }

    /**
     * Collect every stored configuration for exporting.
     *
     * @return array
     */
    private function get_all_configurations_for_export() {
        global $wpdb;
        $table = $wpdb->prefix . 'bq_custom_groups';
        $rows  = $wpdb->get_results( "SELECT * FROM {$table} ORDER BY created ASC" );
        $items = [];

        foreach ( $rows as $row ) {
            $config = json_decode( $row->config, true );
            if ( empty( $config ) ) {
                continue;
            }

            $product_id = (int) $row->product_id;
            $items[]    = [
                'group_id'      => (int) $row->id,
                'product_id'    => $product_id,
                'product_title' => get_the_title( $product_id ),
                'product_slug'  => get_post_field( 'post_name', $product_id ),
                'product_sku'   => get_post_meta( $product_id, '_sku', true ),
                'config'        => $config,
                'created'       => $row->created,
            ];
        }

        return [
            'version'     => '1.0',
            'site'        => home_url(),
            'exported_at' => current_time( 'mysql' ),
            'count'       => count( $items ),
            'items'       => $items,
        ];
    }

    /**
     * Try to resolve a product ID from different hints.
     *
     * @param array $item
     * @return int
     */
    private function locate_product_id_from_item( $item ) {
        $product_id = absint( $item['product_id'] ?? 0 );
        if ( $product_id && 'product' === get_post_type( $product_id ) ) {
            return $product_id;
        }

        $sku = isset( $item['product_sku'] ) ? sanitize_text_field( $item['product_sku'] ) : '';
        if ( $sku && function_exists( 'wc_get_product_id_by_sku' ) ) {
            $sku_id = wc_get_product_id_by_sku( $sku );
            if ( $sku_id ) {
                return (int) $sku_id;
            }
        }

        $slug = isset( $item['product_slug'] ) ? sanitize_title( $item['product_slug'] ) : '';
        if ( $slug ) {
            $post = get_page_by_path( $slug, OBJECT, 'product' );
            if ( $post ) {
                return (int) $post->ID;
            }
        }

        return 0;
    }

    /**
     * Build admin URL for the settings page with optional args.
     *
     * @param array $args
     * @return string
     */
    private function get_admin_page_url( $args = [] ) {
        return add_query_arg(
            array_merge(
                [
                    'page' => 'bq-customizer',
                ],
                $args
            ),
            admin_url( 'admin.php' )
        );
    }

    /**
     * Redirect back to the page and append a notice.
     *
     * @param string $notice
     * @param array  $args
     */
    private function redirect_with_notice( $notice, $args = [] ) {
        $url = $this->get_admin_page_url(
            array_merge(
                [
                    'bq_notice' => $notice,
                ],
                $args
            )
        );

        wp_safe_redirect( $url );
        exit;
    }

    /**
     * Interpret redirect query vars into admin notices.
     *
     * @return array|null
     */
    private function get_notice_from_request() {
        if ( empty( $_GET['bq_notice'] ) ) {
            return null;
        }

        $code = sanitize_key( wp_unslash( $_GET['bq_notice'] ) );
        $data = [
            'message' => '',
            'class'   => 'notice notice-success',
        ];

        switch ( $code ) {
            case 'import_success':
                $count  = isset( $_GET['count'] ) ? absint( wp_unslash( $_GET['count'] ) ) : 0;
                $failed = isset( $_GET['failed'] ) ? absint( wp_unslash( $_GET['failed'] ) ) : 0;
                if ( $count ) {
                    $data['message'] = sprintf(
                        _n( '%d configuration imported.', '%d configurations imported.', $count, 'bouquet-customizer-pro' ),
                        $count
                    );
                } else {
                    $data['message'] = __( 'Import finished.', 'bouquet-customizer-pro' );
                }
                if ( $failed ) {
                    $data['message'] .= ' ' . sprintf(
                        _n( '%d entry skipped.', '%d entries skipped.', $failed, 'bouquet-customizer-pro' ),
                        $failed
                    );
                }
                break;
            case 'import_error':
                $data['class']   = 'notice notice-error';
                $data['message'] = sanitize_text_field( wp_unslash( $_GET['error'] ?? __( 'Unable to import file.', 'bouquet-customizer-pro' ) ) );
                break;
            default:
                return null;
        }

        return $data['message'] ? $data : null;
    }

    /**
     * Retrieve raw steps payload from the submitted form data.
     *
     * @param array $source
     * @return array
     */
    private function extract_steps_payload( $source ) {
        $payload = $source['bq_steps_payload'] ?? '';
        if ( is_string( $payload ) && '' !== $payload ) {
            $decoded = json_decode( wp_unslash( $payload ), true );
            if ( is_array( $decoded ) ) {
                return $decoded;
            }
        }

        if ( isset( $source['bq_steps'] ) ) {
            return wp_unslash( $source['bq_steps'] );
        }

        return [];
    }

    /**
     * Convert form inputs to sanitized steps array.
     *
     * @param array $steps
     * @return array
     */
    private function sanitize_steps( $steps ) {
        $clean          = [];
        $allowed_types  = [ 'radio', 'checkboxes', 'image_buttons', 'text_input', 'text_label', 'custom_price' ];
        $choice_sources = [ 'custom', 'attribute' ];

        foreach ( $steps as $index => $step ) {
            $title = sanitize_text_field( $step['title'] ?? '' );
            if ( ! $title ) {
                continue;
            }

            $input_type = sanitize_key( $step['input_type'] ?? 'radio' );
            if ( ! in_array( $input_type, $allowed_types, true ) ) {
                $input_type = 'radio';
            }

            $selection = in_array( $step['selection'] ?? 'single', [ 'single', 'multiple' ], true ) ? $step['selection'] : 'single';
            if ( 'checkboxes' === $input_type ) {
                $selection = 'multiple';
            } elseif ( in_array( $input_type, [ 'text_input', 'text_label', 'custom_price' ], true ) ) {
                $selection = 'single';
            }
            $max_selections = $step['max_selections'] ?? ( $step['maxSelections'] ?? ( $step['maxSelection'] ?? 0 ) );
            $max_selections = absint( $max_selections );
            if ( 'multiple' !== $selection ) {
                $max_selections = 1;
            }

            $choice_source = sanitize_key( $step['choice_source'] ?? 'custom' );
            if ( ! in_array( $choice_source, $choice_sources, true ) ) {
                $choice_source = 'custom';
            }

            $attribute_slug = sanitize_title( $step['attribute'] ?? '' );
            $operator = $this->sanitize_dependency_operator( $step['dependency_operator'] ?? 'all' );
            $raw_rules = $step['dependency_rules'] ?? [];
            $dependency_rules = $this->normalize_dependency_rules( $raw_rules );
            if ( empty( $dependency_rules ) && ! empty( $step['dependency'] ) ) {
                $legacy = $this->parse_legacy_dependency( $step['dependency'] );
                if ( $legacy ) {
                    $dependency_rules[] = $legacy;
                }
            }

            $new_step = [
                'title'               => $title,
                'dependency'          => sanitize_text_field( $step['dependency'] ?? '' ),
                'dependency_rules'    => $dependency_rules,
                'dependency_operator' => $operator,
                'selection'           => $selection,
                'max_selections'      => $max_selections,
                'input_type'          => $input_type,
                'choice_source'       => $choice_source,
                'attribute'           => 'attribute' === $choice_source ? $attribute_slug : '',
                'required'            => ! empty( $step['required'] ),
                'options'             => [],
            ];

            foreach ( $step['options'] ?? [] as $option_index => $option ) {
                $option_title = sanitize_text_field( $option['title'] ?? '' );
                if ( ! $option_title && ! in_array( $input_type, [ 'text_input', 'text_label', 'custom_price' ], true ) ) {
                    continue;
                }

                $layers = [];
                foreach ( $option['layers'] ?? [] as $layer ) {
                    $normalized_layer = $this->normalize_layer_entry( $layer );
                    if ( $normalized_layer ) {
                        $layers[] = $normalized_layer;
                    }
                }

                $quantity_layers = [];
                foreach ( $option['quantity_layers'] ?? [] as $q_layer ) {
                    $normalized_layer = $this->normalize_layer_entry( $q_layer );
                    if ( $normalized_layer ) {
                        $quantity_layers[] = $normalized_layer;
                    }
                }

                $price_type  = $this->sanitize_price_type( $option['price_type'] ?? 'none' );
                $price_value = $this->extract_price_value( $option['price_value'] ?? ( $option['price_delta'] ?? 0 ) );
                $max_quantity = absint( $option['max_quantity'] ?? 0 );
                $quantity_enabled = ! empty( $option['quantity_enabled'] );

                $new_step['options'][] = [
                    'title'         => $option_title,
                    'price_delta'   => floatval( $option['price_delta'] ?? $price_value ),
                    'price_type'    => $price_type,
                    'price_value'   => $price_value,
                    'layers'        => $layers,
                    'skip_layers'   => ! empty( $option['skip_layers'] ),
                    'quantity_enabled' => $quantity_enabled,
                    'max_quantity'     => $max_quantity,
                    'quantity_layers'  => $quantity_layers,
                ];
            }

            if ( 'text_label' === $input_type && empty( $new_step['options'] ) ) {
                $new_step['options'][] = [
                    'title'         => '',
                    'price_delta'   => 0,
                    'price_type'    => 'none',
                    'price_value'   => 0,
                    'layers'        => [],
                    'skip_layers'   => true,
                ];
            }

            if ( empty( $new_step['options'] ) ) {
                continue;
            }

            $clean[] = $new_step;
        }

        return $clean;
    }

    /**
     * Normalize legacy layer data into a consistent array.
     *
     * @param mixed $layer
     * @return array|null
     */
    private function normalize_layer_entry( $layer ) {
        return bq_normalize_single_layer_entry( $layer );
    }

    /**
     * Extract numeric price from an array or scalar.
     *
     * @param mixed $source
     * @return float
     */
    private function extract_price_value( $source ) {
        return bq_extract_price_from_source( $source );
    }

    /**
     * Sanitize option price type value.
     *
     * @param string $value
     * @return string
     */
    private function sanitize_price_type( $value ) {
        $value   = sanitize_key( $value );
        $allowed = [ 'none', 'fixed', 'percentage', 'quantity', 'custom' ];
        if ( ! in_array( $value, $allowed, true ) ) {
            return 'none';
        }

        return $value;
    }

    /**
     * Ensure dependency operator is either 'all' or 'any'.
     *
     * @param string $value
     * @return string
     */
    private function sanitize_dependency_operator( $value ) {
        $value = sanitize_key( $value );
        return in_array( $value, [ 'all', 'any' ], true ) ? $value : 'all';
    }

    /**
     * Normalize dependency rules into numeric arrays.
     *
     * @param mixed $rules
     * @return array
     */
    private function normalize_dependency_rules( $rules ) {
        if ( is_string( $rules ) ) {
            $decoded = json_decode( $rules, true );
            if ( is_array( $decoded ) ) {
                $rules = $decoded;
            }
        }

        if ( ! is_array( $rules ) ) {
            return [];
        }

        $out = [];
        foreach ( $rules as $rule ) {
            if ( ! is_array( $rule ) ) {
                continue;
            }
            $step = isset( $rule['step'] ) ? absint( $rule['step'] ) : -1;
            if ( $step < 0 ) {
                continue;
            }
            $option_raw = $rule['option'] ?? null;
            $option_is_any = is_string( $option_raw ) && 'any' === strtolower( $option_raw );
            if ( $option_is_any ) {
                $option_value = 'any';
            } else {
                $option_value = isset( $option_raw ) ? absint( $option_raw ) : -1;
                if ( $option_value < 0 ) {
                    continue;
                }
            }
            $out[] = [
                'step'   => $step,
                'option' => $option_value,
            ];
        }

        return $out;
    }

    /**
     * Parse legacy dependency string (format step:option).
     *
     * @param string $value
     * @return array|null
     */
    private function parse_legacy_dependency( $value ) {
        if ( ! is_string( $value ) || ! preg_match( '/^(\d+):(\d+)$/', $value, $matches ) ) {
            return null;
        }
        return [
            'step'   => absint( $matches[1] ),
            'option' => absint( $matches[2] ),
        ];
    }

    /**
     * Get WooCommerce products list.
     *
     * @return array
     */
    private function get_product_options() {
        $products = [];
        if ( ! class_exists( 'WooCommerce' ) ) {
            return $products;
        }

        $args = [
            'post_type'   => 'product',
            'post_status' => 'publish',
            'numberposts' => -1,
        ];

        $all = get_posts( $args );
        foreach ( $all as $product ) {
            $products[ $product->ID ] = $product->post_title;
        }

        return $products;
    }

    /**
     * Retrieve saved configurations for display.
     *
     * @return array
     */
    private function get_saved_configurations() {
        global $wpdb;
        $table = $wpdb->prefix . 'bq_custom_groups';
        $cache_key = 'bq_saved_configs';
        if ( function_exists( 'wp_cache_get' ) ) {
            $found  = null;
            $cached = wp_cache_get( $cache_key, 'bq_customizer', false, $found );
            if ( $found && is_array( $cached ) ) {
                return $cached;
            }
        }

        $rows  = $wpdb->get_results( "SELECT * FROM {$table} ORDER BY created DESC LIMIT 30" );
        $out   = [];

        foreach ( $rows as $row ) {
            $config = json_decode( $row->config, true );
            if ( ! $config ) {
                continue;
            }

            $normalized = bq_normalize_config_structure( $config );

            $out[] = [
                'group_id'      => (int) $row->id,
                'product_id'    => (int) $row->product_id,
                'product_title' => get_the_title( $row->product_id ),
                'step_count'    => isset( $normalized['steps'] ) ? count( (array) $normalized['steps'] ) : 0,
                'config'        => $normalized,
            ];
        }

        if ( function_exists( 'wp_cache_set' ) ) {
            wp_cache_set( $cache_key, $out, 'bq_customizer', MINUTE_IN_SECONDS * 5 );
        }

        return $out;
    }

    /**
     * Delete a stored customization group.
     *
     * @param int $group_id
     * @return bool
     */
    private function delete_configuration( $group_id ) {
        if ( ! $group_id ) {
            return false;
        }

        global $wpdb;
        $table = $wpdb->prefix . 'bq_custom_groups';
        $record = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT product_id FROM {$table} WHERE id = %d",
                $group_id
            )
        );
        if ( ! $record ) {
            return false;
        }

        $deleted = $wpdb->delete( $table, [ 'id' => $group_id ], [ '%d' ] );
        if ( false === $deleted ) {
            return false;
        }

        bq_clear_product_config_cache( (int) $record->product_id );
        bq_clear_saved_configs_cache();

        return true;
    }

    /**
     * Retrieve WooCommerce attribute taxonomy data for the builder.
     *
     * @return array
     */
    private function get_attribute_library() {
        if ( ! function_exists( 'wc_get_attribute_taxonomies' ) ) {
            return [];
        }

        $taxonomies = wc_get_attribute_taxonomies();
        if ( empty( $taxonomies ) ) {
            return [];
        }

        $library = [];
        foreach ( $taxonomies as $taxonomy ) {
            $taxonomy_name = wc_attribute_taxonomy_name( $taxonomy->attribute_name );
            $terms         = get_terms(
                [
                    'taxonomy'   => $taxonomy_name,
                    'hide_empty' => false,
                ]
            );
            if ( is_wp_error( $terms ) ) {
                $terms = [];
            }

            $library[] = [
                'slug'  => $taxonomy_name,
                'label' => $taxonomy->attribute_label,
                'terms' => array_values(
                    array_map(
                        static function ( $term ) {
                            return [
                                'slug' => $term->slug,
                                'name' => $term->name,
                            ];
                        },
                        is_array( $terms ) ? $terms : []
                    )
                ),
            ];
        }

        return $library;
    }

    /**
     * Build data shared with the admin builder script.
     *
     * @param array|null $configs
     * @return array
     */
    private function get_admin_script_data( $configs = null ) {
        if ( null === $configs ) {
            $configs = $this->get_saved_configurations();
        }

        $this->configs = $configs;

        return [
            'configs'      => $this->configs,
            'nonce'        => wp_create_nonce( 'bq_admin_nonce' ),
            'stepsLabel'   => __( 'Steps', 'bouquet-customizer-pro' ),
            'optionsLabel' => __( 'Options', 'bouquet-customizer-pro' ),
            'attributes'   => $this->get_attribute_library(),
        ];
    }
}
