<?php
/**
 * Template Name: Bouquet Full Canvas (Product)
 *
 * A conflict-safe, full-width WooCommerce product template for Bouquet Customizer products.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

global $post;
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo( 'charset' ); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<?php
// Keep WooCommerce notices working.
wc_print_notices();
?>
<div class="bq-full-canvas-shell">
    <div class="bq-full-canvas-container">
        <header class="bq-full-canvas-header">
            <h1><?php echo esc_html( get_the_title( $post ) ); ?></h1>
            <?php
            $shop_link = function_exists( 'wc_get_page_id' ) ? get_permalink( wc_get_page_id( 'shop' ) ) : home_url();
            ?>
            <a href="<?php echo esc_url( $shop_link ); ?>"><?php esc_html_e( 'Back to shop', 'bouquet-customizer-pro' ); ?></a>
        </header>
        <main class="bq-full-canvas-main" role="main">
            <?php
            if ( have_posts() ) {
                while ( have_posts() ) {
                    the_post();
                    wc_get_template_part( 'content', 'single-product' );
                }
            }
            ?>
        </main>
    </div>
</div>
<?php wp_footer(); ?>
</body>
</html>
