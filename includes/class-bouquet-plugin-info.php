<?php
defined( 'ABSPATH' ) || exit;

/**
 * Adds a "View details" modal for this plugin inside the Plugins list.
 */
class Bouquet_Customizer_Plugin_Info {
    /**
     * Slug used for the plugin info modal.
     *
     * @var string
     */
    private $slug = 'bouquet-customizer-pro';

    public function __construct() {
        add_filter( 'plugin_action_links_' . plugin_basename( BQP_FILE ), [ $this, 'add_view_details_link' ] );
        add_filter( 'plugins_api', [ $this, 'inject_plugin_info' ], 10, 3 );
        add_action( 'admin_enqueue_scripts', [ $this, 'maybe_enqueue_thickbox' ] );
    }

    /**
     * Append "View details" link to the plugin row actions.
     */
    public function add_view_details_link( $links ) {
        $details_url = add_query_arg(
            [
                'tab'    => 'plugin-information',
                'plugin' => $this->slug,
                'TB_iframe' => 'true',
                'width'  => '772',
                'height' => '600',
            ],
            admin_url( 'plugin-install.php' )
        );

        $links[] = sprintf(
            '<a href="%s" class="thickbox open-plugin-details-modal">%s</a>',
            esc_url( $details_url ),
            esc_html__( 'Details & changelog', 'bouquet-customizer-pro' )
        );

        return $links;
    }

    /**
     * Ensure Thickbox assets are available on the plugins screen.
     */
    public function maybe_enqueue_thickbox( $hook ) {
        if ( 'plugins.php' === $hook ) {
            add_thickbox();
        }
    }

    /**
     * Provide plugin data for the WP plugin modal when our slug is requested.
     */
    public function inject_plugin_info( $result, $action, $args ) {
        if ( 'plugin_information' !== $action ) {
            return $result;
        }

        if ( empty( $args->slug ) || $this->slug !== $args->slug ) {
            return $result;
        }

        $sections = [
            'description'  => $this->get_description_html(),
            'installation' => $this->get_installation_html(),
            'changelog'    => $this->get_changelog_html(),
        ];

        $info              = new stdClass();
        $info->name        = 'Bouquet Customizer Pro';
        $info->slug        = $this->slug;
        $info->version     = BQP_VERSION;
        $info->author      = '<a href="https://onvirtualworld.com/">On Virtual World Team</a>';
        $info->homepage    = 'https://onvirtualworld.com/';
        $info->download_link = '';
        $info->requires    = '6.0';
        $info->tested      = get_bloginfo( 'version' );
        $info->sections    = $sections;
        $info->banners     = [];

        return $info;
    }

    private function get_description_html() {
        return wpautop(
            __( 'Bouquet Customizer Pro is a dynamic WooCommerce bouquet builder with layered PNG previews. Let shoppers assemble bouquets step by step, see a live composite preview, and capture a PNG alongside their order.', 'bouquet-customizer-pro' ) .
            ' ' .
            __( 'Includes a full-canvas product template option to avoid theme conflicts and a modal configurator with price calculations.', 'bouquet-customizer-pro' )
        );
    }

    private function get_installation_html() {
        $steps = [
            __( 'Upload and activate Bouquet Customizer Pro.', 'bouquet-customizer-pro' ),
            __( 'In WooCommerce → Bouquet Customizer, create steps and options with your PNG layers.', 'bouquet-customizer-pro' ),
            __( 'Assign the configuration to a product. Optional: enable the Full Canvas Template on that product for a clean layout.', 'bouquet-customizer-pro' ),
            __( 'On the product page, use “Customize Your Bouquet” to open the modal, build the bouquet, and add to cart.', 'bouquet-customizer-pro' ),
        ];

        $html  = '<ol>';
        foreach ( $steps as $step ) {
            $html .= '<li>' . esc_html( $step ) . '</li>';
        }
        $html .= '</ol>';
        return $html;
    }

    private function get_changelog_html() {
        $entries = [
            [
                'version' => '2.0.3',
                'notes'   => __( 'Polished the Plugins list details link (single professional “Details & changelog” action).', 'bouquet-customizer-pro' ),
            ],
            [
                'version' => '2.0.2',
                'notes'   => __( 'Improved mobile layout for the customizer and ensured custom text inputs persist through cart and order meta.', 'bouquet-customizer-pro' ),
            ],
            [
                'version' => '2.0.1',
                'notes'   => __( 'Stabilized REST add-to-cart flow and preview handling.', 'bouquet-customizer-pro' ),
            ],
            [
                'version' => '2.0.0',
                'notes'   => __( 'Major release: revamped modal UI, added full-canvas product template option, and better price/layer handling.', 'bouquet-customizer-pro' ),
            ],
            [
                'version' => '1.2.0',
                'notes'   => __( 'Enhanced admin builder with dependency rules and quantity-aware layers.', 'bouquet-customizer-pro' ),
            ],
            [
                'version' => '1.1.0',
                'notes'   => __( 'Added layered PNG preview stacking and price delta summaries.', 'bouquet-customizer-pro' ),
            ],
            [
                'version' => '1.0.0',
                'notes'   => __( 'Initial release of Bouquet Customizer Pro with step-based option selection.', 'bouquet-customizer-pro' ),
            ],
        ];

        $html = '';
        foreach ( $entries as $entry ) {
            $html .= '<h4>' . sprintf( esc_html__( 'Version %s', 'bouquet-customizer-pro' ), esc_html( $entry['version'] ) ) . '</h4>';
            $html .= '<p>' . esc_html( $entry['notes'] ) . '</p>';
        }
        return $html;
    }
}
