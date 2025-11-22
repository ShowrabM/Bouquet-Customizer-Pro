r# Bouquet Customizer Pro (Flower layer plugin)

Dynamic WooCommerce bouquet builder with layered PNG previews and a new optional Full Canvas product template for conflict-free layouts.
- Quantity-aware options: per-option quantity selector with per-quantity images and price deltas.

## Features
- Modal-based bouquet configurator with live layered preview and price updates.
- Per-product configurations stored in a custom table; cached for performance.
- Admin import/export of bouquet configs.
- Optional “Bouquet Full Canvas” product template for a clean, theme-neutral layout (Elementor canvas style).
- Mobile-friendly horizontal carousel options and swipe gestures.

## Installation
1. Copy the plugin folder to `wp-content/plugins/Flower layer/` (or install via your own packaging).
2. Activate “Bouquet Customizer Pro” in **Plugins**.
3. Ensure WooCommerce is active.

## Usage
1. Open a product in wp-admin.
2. Configure bouquet steps and options in **WooCommerce → Bouquet Customizer**.
3. Enable the product’s Full Canvas template (optional):
   - In the product edit screen, tick **Enable Bouquet Full Canvas template** (meta box in the sidebar).
   - Update the product. Only that product uses the canvas template; others stay on the theme layout.
4. On the product page, click **Customize Your Bouquet** to open the modal and build the bouquet. Selected options and pricing carry into cart/order meta.
5. For quantity images/prices: enable the quantity selector on an option, set a max (or 0), and add per-quantity images and prices. The last entry repeats for higher quantities.

## Files of interest
- `bouquet-customizer-pro.php` — plugin bootstrap and constants.
- `includes/class-bouquet-admin.php` — admin UI, import/export, meta box for the canvas template.
- `includes/class-bouquet-frontend.php` — frontend enqueue, modal shell, template switch, body class.
- `templates/bq-full-canvas-template.php` — minimal WooCommerce product template for canvas mode.
- `assets/css/bq-full-canvas-template.css` — styling for the canvas template container.
- `assets/css/bouquet-customizer.css` — modal styles (desktop grid + mobile carousel).
- `assets/js/bouquet-customizer.js` — configurator logic, rendering, pricing, dependencies.

## Notes on the Full Canvas template
- Applies only when the product meta `_bq_full_canvas_template` is set (via the checkbox).
- Keeps WooCommerce hooks intact (notices, `content-single-product`).
- Adds `bq-full-canvas-template` body class and a contained shell to minimize theme conflicts.

## Development
- Assets are plain JS/CSS (no build step). Cache-busting uses file mtime in `bq_get_asset_version()`.
- Avoid removing existing user configs; they reside in the `bq_custom_groups` table.
- If you change assets, bump versions or rely on the built-in cache-buster.

## Support
- Requires WooCommerce.
- Tested with Elementor-style canvas pages; aim is to avoid theme wrapper conflicts. For theme overrides, keep hooks aligned with WooCommerce defaults.
- Current plugin version is defined in `bouquet-customizer-pro.php` (no version bump here).
