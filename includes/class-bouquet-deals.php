<?php
defined( 'ABSPATH' ) || exit;

class Bouquet_Customizer_Deals {
    public function __construct() {
        add_shortcode( 'bq_plugin_deals', [ $this, 'render_deals_shortcode' ] );
        add_action( 'wp_enqueue_scripts', [ $this, 'register_assets' ] );
    }

    /**
     * Register assets once; enqueue when shortcode renders.
     */
    public function register_assets() {
        wp_register_style(
            'bq-deals-style',
            BQP_URL . '/assets/css/bq-deals.css',
            [],
            bq_get_asset_version( 'assets/css/bq-deals.css' )
        );

        wp_register_script(
            'bq-deals-script',
            BQP_URL . '/assets/js/bq-deals.js',
            [],
            bq_get_asset_version( 'assets/js/bq-deals.js' ),
            true
        );
    }

    /**
     * Shortcode output for the deals grid and modal.
     *
     * @return string
     */
    public function render_deals_shortcode() {
        wp_enqueue_style( 'bq-deals-style' );
        wp_enqueue_script( 'bq-deals-script' );

        $deals = $this->get_deals_data();

        ob_start();
        ?>
        <div class="bq-deals">
            <div class="bq-deals__header">
                <div>
                    <p class="bq-deals__eyebrow"><?php esc_html_e( 'Plugins', 'bouquet-customizer-pro' ); ?></p>
                    <h2><?php esc_html_e( 'Popular Deals & Utilities', 'bouquet-customizer-pro' ); ?></h2>
                    <p class="bq-deals__lede"><?php esc_html_e( 'Browse curated plugins with quick view details: description, installation steps, and changelog.', 'bouquet-customizer-pro' ); ?></p>
                </div>
            </div>
            <div class="bq-deals__grid">
                <?php foreach ( $deals as $deal ) : ?>
                    <?php
                    $payload = wp_json_encode( $deal );
                    ?>
                    <article class="bq-deal-card">
                        <div class="bq-deal-card__media">
                            <?php if ( ! empty( $deal['image'] ) ) : ?>
                                <img src="<?php echo esc_url( $deal['image'] ); ?>" alt="<?php echo esc_attr( $deal['title'] ); ?>" />
                            <?php endif; ?>
                            <?php if ( ! empty( $deal['badge'] ) ) : ?>
                                <span class="bq-deal-card__badge"><?php echo esc_html( $deal['badge'] ); ?></span>
                            <?php endif; ?>
                        </div>
                        <div class="bq-deal-card__body">
                            <h3><?php echo esc_html( $deal['title'] ); ?></h3>
                            <?php if ( ! empty( $deal['tagline'] ) ) : ?>
                                <p class="bq-deal-card__tagline"><?php echo esc_html( $deal['tagline'] ); ?></p>
                            <?php endif; ?>
                            <div class="bq-deal-card__meta">
                                <?php if ( ! empty( $deal['price'] ) ) : ?>
                                    <span class="bq-deal-card__price"><?php echo esc_html( $deal['price'] ); ?></span>
                                <?php endif; ?>
                                <?php if ( ! empty( $deal['savings'] ) ) : ?>
                                    <span class="bq-deal-card__pill"><?php echo esc_html( $deal['savings'] ); ?></span>
                                <?php endif; ?>
                            </div>
                            <div class="bq-deal-card__actions">
                                <?php if ( ! empty( $deal['link'] ) ) : ?>
                                    <a class="bq-button bq-button--ghost" href="<?php echo esc_url( $deal['link'] ); ?>" target="_blank" rel="noreferrer"><?php esc_html_e( 'Learn more', 'bouquet-customizer-pro' ); ?></a>
                                <?php endif; ?>
                                <button type="button" class="bq-button bq-button--primary bq-deal-view" data-deal='<?php echo esc_attr( $payload ); ?>'>
                                    <?php esc_html_e( 'View details', 'bouquet-customizer-pro' ); ?>
                                </button>
                            </div>
                        </div>
                    </article>
                <?php endforeach; ?>
            </div>
        </div>

        <div id="bq-deal-modal" class="bq-deal-modal" hidden>
            <div class="bq-deal-modal__backdrop"></div>
            <div class="bq-deal-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="bq-deal-modal-title">
                <button type="button" class="bq-deal-modal__close" aria-label="<?php esc_attr_e( 'Close dialog', 'bouquet-customizer-pro' ); ?>">&times;</button>
                <div class="bq-deal-modal__header">
                    <div class="bq-deal-modal__logo">
                        <img src="" alt="" data-field="image" />
                    </div>
                    <div>
                        <h3 id="bq-deal-modal-title" data-field="title"></h3>
                        <p class="bq-deal-modal__tagline" data-field="tagline"></p>
                        <div class="bq-deal-modal__meta">
                            <span class="bq-deal-modal__price" data-field="price"></span>
                            <span class="bq-deal-modal__pill" data-field="savings"></span>
                        </div>
                    </div>
                </div>
                <div class="bq-deal-tabs" role="tablist" aria-label="<?php esc_attr_e( 'Plugin details', 'bouquet-customizer-pro' ); ?>">
                    <button type="button" class="bq-deal-tab is-active" role="tab" aria-selected="true" data-tab="description"><?php esc_html_e( 'Description', 'bouquet-customizer-pro' ); ?></button>
                    <button type="button" class="bq-deal-tab" role="tab" aria-selected="false" data-tab="installation"><?php esc_html_e( 'Installation', 'bouquet-customizer-pro' ); ?></button>
                    <button type="button" class="bq-deal-tab" role="tab" aria-selected="false" data-tab="changelog"><?php esc_html_e( 'Changelog', 'bouquet-customizer-pro' ); ?></button>
                </div>
                <div class="bq-deal-tabpanels">
                    <div class="bq-deal-panel is-active" data-panel="description"></div>
                    <div class="bq-deal-panel" data-panel="installation"></div>
                    <div class="bq-deal-panel" data-panel="changelog"></div>
                </div>
                <div class="bq-deal-modal__footer">
                    <a class="bq-button bq-button--ghost" data-field="link" href="#" target="_blank" rel="noreferrer"><?php esc_html_e( 'Plugin site', 'bouquet-customizer-pro' ); ?></a>
                    <button type="button" class="bq-button bq-button--primary" data-field="cta"><?php esc_html_e( 'Get this plugin', 'bouquet-customizer-pro' ); ?></button>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Example data for deals. Replace with dynamic source if needed.
     *
     * @return array
     */
    private function get_deals_data() {
        return [
            [
                'title'       => 'WP Reset',
                'tagline'     => 'Safest way to reset, snapshot, and recover your WordPress.',
                'price'       => '$49/site',
                'savings'     => 'Save 20%',
                'badge'       => 'Popular',
                'link'        => 'https://wpreset.com/',
                'image'       => BQP_URL . '/assets/img/deal-wpreset.svg',
                'description' => '<p>WP Reset quickly resets the site to default installation values without removing files. Built-in snapshots give 1-click restore safety.</p><p>Speeds up testing &amp; debugging by allowing quick resets, while fail-safe mechanisms ensure you never lose data by accident.</p>',
                'installation'=> [
                    'Install and activate WP Reset from your WordPress dashboard.',
                    'Open Tools → WP Reset and create your first snapshot.',
                    'Use the one-click reset or selective reset tools as needed.',
                ],
                'changelog'   => [
                    [ 'version' => '1.95.0', 'date' => '2024-10-12', 'notes' => 'Added multi-snapshot queue and improved rollback UX.' ],
                    [ 'version' => '1.94.0', 'date' => '2024-08-05', 'notes' => 'Performance boost for large media libraries; minor fixes.' ],
                ],
                'cta'         => 'Install WP Reset',
            ],
            [
                'title'       => 'Security Shield',
                'tagline'     => 'Block bad bots, stop exploits, and harden login flows.',
                'price'       => '$79/year',
                'savings'     => 'Launch promo',
                'badge'       => 'New',
                'link'        => 'https://example.com/security-shield',
                'image'       => BQP_URL . '/assets/img/deal-security.svg',
                'description' => '<p>Security Shield combines IP reputation, login throttling, and file-change alerts to keep your site safe.</p><p>Includes downtime pings, 2FA, and automatic malware signatures updated weekly.</p>',
                'installation'=> [
                    'Upload and activate Security Shield.',
                    'Run the guided setup to enable firewall and 2FA.',
                    'Review the weekly security report delivered to your inbox.',
                ],
                'changelog'   => [
                    [ 'version' => '2.1.0', 'date' => '2025-01-10', 'notes' => 'Added country blocking and improved brute-force detection.' ],
                    [ 'version' => '2.0.5', 'date' => '2024-11-30', 'notes' => 'Refined malware scan signatures and dashboard widgets.' ],
                ],
                'cta'         => 'Secure my site',
            ],
            [
                'title'       => 'Image Optimizer Pro',
                'tagline'     => 'Smart compression and WebP/AVIF delivery for faster pages.',
                'price'       => '$59/year',
                'savings'     => 'Bundle & save',
                'badge'       => 'Performance',
                'link'        => 'https://example.com/image-optimizer',
                'image'       => BQP_URL . '/assets/img/deal-optimizer.svg',
                'description' => '<p>Compress media automatically, generate WebP/AVIF, and serve via built-in CDN rules. Keeps originals safe with one-click restore.</p><p>Works with WooCommerce galleries and supports scheduled bulk optimizations.</p>',
                'installation'=> [
                    'Activate Image Optimizer Pro and connect your license key.',
                    'Enable automatic compression for new uploads.',
                    'Run a bulk optimize to convert existing media to WebP/AVIF.',
                ],
                'changelog'   => [
                    [ 'version' => '3.4.0', 'date' => '2024-12-18', 'notes' => 'Added AVIF fallback handling and multi-language alt syncing.' ],
                    [ 'version' => '3.3.2', 'date' => '2024-10-02', 'notes' => 'Stability fixes for WooCommerce product galleries.' ],
                ],
                'cta'         => 'Speed up images',
            ],
        ];
    }
}
