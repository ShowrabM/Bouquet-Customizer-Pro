(function ($) {
    const $steps = $('#bq-steps');
    if (!$steps.length) {
        return;
    }
    const $form = $('.bq-config-form');
    const $payloadField = $('#bq-steps-payload');
    const adminData = window.bqAdminData || {};
    const attributeLibrary = Array.isArray(adminData.attributes) ? adminData.attributes : [];
    let stepCounter = $steps.children('.bq-step').length;

    /**
     * Helper to build a new text input row.
     */
    function buildUrlInputRow(nameAttr, priceNameAttr, value, extraClass, placeholder, targetSelector, priceValue) {
        const safeValue = (value && value.url) ? value.url : (typeof value === 'string' ? value : '');
        const safePrice = (value && typeof value.price_delta !== 'undefined') ? value.price_delta : (typeof priceValue !== 'undefined' ? priceValue : '');
        return `
            <div class="${extraClass || ''}">
                <div class="bq-inline-preview">
                    <span class="bq-inline-preview__placeholder">No image</span>
                    <input type="hidden" name="${nameAttr}" value="${escapeAttr(safeValue)}" id="${targetSelector ? targetSelector.replace('#','') : ''}" />
                </div>
                <input type="number" step="0.01" name="${priceNameAttr}" value="${escapeAttr(safePrice)}" class="bq-inline-price" placeholder="Price" />
                <button type="button" class="button bq-select-image" data-target="${targetSelector || ''}">Select image</button>
                <button type="button" class="button-link bq-remove-inline-row">Remove</button>
            </div>
        `;
    }

    const INPUT_TYPES = [
        { value: 'radio', label: 'Radio buttons' },
        { value: 'checkboxes', label: 'Checkboxes' },
        { value: 'image_buttons', label: 'Image buttons' },
        { value: 'text_input', label: 'Text input' },
        { value: 'text_label', label: 'Static text' },
        { value: 'custom_price', label: 'Customer defined price' },
    ];

    const PRICE_TYPES = [
        { value: 'none', label: 'No cost' },
        { value: 'fixed', label: 'Fixed price' },
        { value: 'percentage', label: 'Percentage of base price' },
        { value: 'quantity', label: 'Quantity based' },
        { value: 'custom', label: 'Customer defined price' },
    ];

    function init() {
        $('#bq-add-step').on('click', function () {
            addStep();
            refreshStepNumbers();
        });
        if ($form.length) {
            $form.on('submit', handleFormSubmit);
        }

        $steps.on('click', '.bq-add-option', function () {
            addOption($(this).data('step'));
        });

        $steps.on('click', '.bq-duplicate-option', function () {
            const $option = $(this).closest('.bq-option');
            duplicateOption($option);
        });

        $steps.on('click', '.bq-duplicate-step', function () {
            const $step = $(this).closest('.bq-step');
            duplicateStep($step);
        });

        $steps.on('click', '.bq-move-up', function () {
            const $step = $(this).closest('.bq-step');
            const $previous = $step.prev('.bq-step');
            if ($previous.length) {
                $step.insertBefore($previous);
                refreshStepNumbers();
            }
        });

        $steps.on('click', '.bq-move-down', function () {
            const $step = $(this).closest('.bq-step');
            const $next = $step.next('.bq-step');
            if ($next.length) {
                $step.insertAfter($next);
                refreshStepNumbers();
            }
        });

        $steps.on('click', '.bq-remove-step', function () {
            $(this).closest('.bq-step').remove();
            refreshStepNumbers();
        });

        $steps.on('click', '.bq-remove-option', function () {
            const $step = $(this).closest('.bq-step');
            $(this).closest('.bq-option').remove();
            refreshOptionChips($step);
        });

        $steps.on('click', '.bq-add-qty-visual', function () {
            const stepIndex = $(this).data('step');
            const optionIndex = $(this).data('option');
            addQuantityVisual(stepIndex, optionIndex);
        });

        $steps.on('click', '.bq-remove-inline-row', function () {
            $(this).closest('.bq-inline-row').remove();
        });

        $steps.on('click', '.bq-add-layer', function () {
            const stepIndex = $(this).data('step');
            const optionIndex = $(this).data('option');
            addLayer(stepIndex, optionIndex);
        });

        $steps.on('click', '.bq-remove-layer', function () {
            $(this).closest('.bq-layer-row').remove();
        });

        $steps.on('click', '.bq-add-step-inline', function () {
            addStep();
            refreshStepNumbers();
            refreshDependencyOptions();
        });

        $steps.on('click', '.bq-option-toggle', function () {
            toggleOptionDetails($(this).closest('.bq-option'));
        });

        $steps.on('click', '.bq-toggle-step', function () {
            const $step = $(this).closest('.bq-step');
            const shouldCollapse = !$step.hasClass('is-collapsed');
            setStepCollapsedState($step, shouldCollapse);
        });

        $steps.on('click', '.bq-select-image', function (event) {
            event.preventDefault();
            const targetSelector = $(this).data('target');
            const $target = $(targetSelector);
            if (!$target.length) {
                return;
            }
            openMediaFrame($target);
        });

        $steps.on('input change', '.bq-layer-row input[name*="[url]"]', function () {
            refreshLayerPreview($(this));
        });
        $steps.on('input change', '.bq-quantity-visuals input', function () {
            refreshInlinePreview($(this));
        });

        $steps.on('input', '.bq-option input[name*="[title]"]', function () {
            refreshDependencyOptions();
        });
        $steps.on('input', '.bq-step-grid input[name$="[title]"]', function () {
            refreshDependencyOptions();
        });

        $steps.on('input', '[data-heading]', function () {
            const target = $(this).data('heading');
            const fallback = $(this).data('default') || '';
            const value = $(this).val().trim() || fallback;
            if (target) {
                $(target).text(value);
            }
        });

        $steps.on('change', '.bq-input-type', function () {
            handleInputTypeChange($(this));
        });

        $steps.on('change', '.bq-selection-mode', function () {
            handleSelectionModeChange($(this));
        });

        $steps.on('input change', '.bq-max-selections', function () {
            const $step = $(this).closest('.bq-step');
            if ($step.length) {
                syncSelectionMode($step);
            }
        });

        $steps.on('change', '.bq-choice-source', function () {
            handleChoiceSourceChange($(this));
        });

        $steps.on('change', '.bq-price-type', function () {
            handlePriceTypeChange($(this));
        });

        $('.bq-load-config').on('click', function () {
            const raw = $(this).attr('data-config');
            if (!raw) {
                return;
            }

            let config = null;
            try {
                config = JSON.parse(raw);
            } catch (error) {
                return;
            }

            $('#bq-product-id').val(config.product_id).trigger('change');
            $steps.empty();
            stepCounter = 0;

            if (config.config && Array.isArray(config.config.steps)) {
                config.config.steps.forEach(function (stepData) {
                    addStep(stepData);
                });
            }
            refreshStepNumbers();
        });

        initSortable();
    }

    function initSortable() {
        if (typeof $steps.sortable !== 'function') {
            return;
        }

        $steps.sortable({
            items: '.bq-step',
            handle: '.bq-step-handle',
            placeholder: 'bq-step-placeholder',
            forcePlaceholderSize: true,
            start: function (_event, ui) {
                ui.item.addClass('is-sorting');
            },
            stop: function (_event, ui) {
                ui.item.removeClass('is-sorting');
            },
            update: function () {
                refreshStepNumbers();
            },
        });
    }

    function addStep(stepData = {}, insertAfter = null) {
        const index = stepCounter++;
        const headingId = `bq-step-heading-${Date.now()}-${index}`;
        const selectionLabelId = `bq-step-mode-${Date.now()}-${index}`;
        const defaultTitle = stepData.title || `Step ${index + 1}`;
        const selectionMode = stepData.selection || 'single';
        const inputType = stepData.input_type || (selectionMode === 'multiple' ? 'checkboxes' : 'radio');
        const maxSelections = parseInt(stepData.max_selections || stepData.maxSelections || stepData.maxSelection || 0, 10) || 0;
        const choiceSource = stepData.choice_source || 'custom';
        const attribute = stepData.attribute || '';
        const selectionText = (selectionMode === 'multiple' && maxSelections > 0)
            ? `Up to ${maxSelections} selections`
            : getSelectionLabel(inputType, selectionMode);

        const step = $(`
            <div class="bq-step" data-step-index="${index}">
                <div class="bq-step-head">
                    <div class="bq-step-title">
                        <span class="bq-step-handle" role="button" tabindex="0" aria-label="Drag to reorder">
                            <span class="bq-step-handle-bars" aria-hidden="true"></span>
                        </span>
                        <span class="bq-step-number">${index + 1}</span>
                        <div>
                            <h3 id="${headingId}">${escapeHtml(defaultTitle)}</h3>
                            <span class="bq-step-mode" id="${selectionLabelId}">${selectionText}</span>
                        </div>
                    </div>
                    <div class="bq-step-actions">
                        <button type="button" class="button-link bq-toggle-step" aria-expanded="true">Collapse</button>
                        <button type="button" class="button-link bq-move-up" aria-label="Move step up">Move Up</button>
                        <button type="button" class="button-link bq-move-down" aria-label="Move step down">Move Down</button>
                        <button type="button" class="button-link bq-duplicate-step">Duplicate</button>
                        <button type="button" class="button-link bq-remove-step">Remove</button>
                    </div>
                </div>
            <div class="bq-step-body">
                <div class="bq-step-grid">
                        <label>Step title
                            <input type="text" name="bq_steps[${index}][title]" value="${escapeAttr(stepData.title || '')}" required data-heading="#${headingId}" data-default="${escapeAttr(defaultTitle)}" />
                        </label>
                        <label>Option type
                            <select name="bq_steps[${index}][input_type]" class="bq-input-type" data-mode-target="#${selectionLabelId}" data-step-index="${index}">
                                ${INPUT_TYPES.map((type) => `<option value="${type.value}" ${inputType === type.value ? 'selected' : ''}>${type.label}</option>`).join('')}
                            </select>
                        </label>
                        <label>Selection behavior
                            <select class="bq-selection-mode" data-step-index="${index}" data-mode-target="#${selectionLabelId}">
                                <option value="single" ${selectionMode === 'single' ? 'selected' : ''}>Single option</option>
                                <option value="multiple" ${selectionMode === 'multiple' ? 'selected' : ''}>Allow multiple selections</option>
                            </select>
                            <input type="hidden" class="bq-selection-value" name="bq_steps[${index}][selection]" value="${selectionMode}">
                        </label>
                        <label class="bq-max-selection-field">Max selections (0 = no limit)
                            <input type="number" name="bq_steps[${index}][max_selections]" class="bq-max-selections" min="0" step="1" value="${maxSelections}" />
                        </label>
                        <label>Choice source
                            <select name="bq_steps[${index}][choice_source]" class="bq-choice-source" data-step-index="${index}">
                                <option value="custom" ${choiceSource === 'custom' ? 'selected' : ''}>Create custom choices</option>
                                <option value="attribute" ${choiceSource === 'attribute' ? 'selected' : ''}>Use product attribute</option>
                            </select>
                        </label>
                        <label class="bq-attribute-field ${choiceSource === 'attribute' ? '' : 'is-hidden'}">WooCommerce attribute
                            <select name="bq_steps[${index}][attribute]" class="bq-attribute-select">
                                <option value="">Select attribute</option>
                                ${attributeLibrary.map((attr) => `<option value="${escapeAttr(attr.slug)}" ${attribute === attr.slug ? 'selected' : ''}>${escapeHtml(attr.label)}</option>`).join('')}
                            </select>
                        </label>
            </div>
                    <div class="bq-options" data-step-index="${index}"></div>
                    <div class="bq-layer-toolbar">
                        <button type="button" class="button bq-add-option" data-step="${index}">Add option</button>
                        <button type="button" class="button button-primary bq-add-step-inline" data-step="${index}">Add step</button>
                    </div>
                </div>
            </div>
        `);

        const dependencyPanel = createDependencyPanel(index, stepData);
        step.find('.bq-step-body .bq-step-grid').after(dependencyPanel);

        if (insertAfter && insertAfter.length) {
            insertAfter.after(step);
        } else {
            $steps.append(step);
        }
        if (typeof $steps.sortable === 'function') {
            $steps.sortable('refresh');
        }
        syncSelectionMode(step);
        if (Array.isArray(stepData.options) && stepData.options.length) {
            stepData.options.forEach(function (optionData) {
                let normalized = optionData;
                if (optionData && typeof optionData === 'object') {
                    try {
                        normalized = JSON.parse(JSON.stringify(optionData));
                    } catch (_error) {
                        normalized = optionData;
                    }
                }
                addOption(index, normalized || {}, { stepElement: step, skipRefresh: true, skipPreview: true });
            });
            refreshOptionChips(step);
        } else {
            addOption(index, {}, { stepElement: step });
        }
        refreshStepNumbers();
        setStepCollapsedState(step, true);
    }

    function addOption(stepIndex, optionData = {}, settings = {}) {
        const config = settings && typeof settings === 'object' ? settings : {};
        const $step = config.stepElement && config.stepElement.length
            ? config.stepElement
            : $steps.find(`.bq-step[data-step-index="${stepIndex}"]`);
        if (!$step.length) {
            return;
        }
        const skipRefresh = config.skipRefresh === true;
        const skipPreview = config.skipPreview === true;
        const layersPayload = Array.isArray(optionData.layers) ? optionData.layers : [];

        const optionIndex = $step.find('.bq-option').length;
        const $options = $step.find('.bq-options');
        const optionHeadingId = `bq-option-heading-${Date.now()}-${stepIndex}-${optionIndex}`;
        const defaultOptionTitle = optionData.title || `Option ${optionIndex + 1}`;
        const chipLabel = `Option ${optionIndex + 1}`;
        const priceType = optionData.price_type || 'none';
        const priceValue = typeof optionData.price_value !== 'undefined'
            ? optionData.price_value
            : (typeof optionData.price_delta !== 'undefined' ? optionData.price_delta : '');
        const priceWrapperId = `bq-price-${stepIndex}-${optionIndex}-${Date.now()}`;
        const showPriceField = ['fixed', 'percentage', 'quantity'].includes(priceType);
        const skipLayers = optionData.skip_layers === true
            || optionData.skip_layers === '1'
            || optionData.skip_layers === 1;
        const quantityEnabled = optionData.quantity_enabled === true
            || optionData.quantity_enabled === '1'
            || optionData.quantity_enabled === 1;
        const maxQuantity = parseInt(optionData.max_quantity, 10) || 0;
        const quantityLayers = Array.isArray(optionData.quantity_layers) ? optionData.quantity_layers : [];

        const option = $(`
            <div class="bq-option" data-step-index="${stepIndex}" data-option-index="${optionIndex}">
                <div class="bq-option-row">
                    <span class="bq-option-chip">${chipLabel}</span>
                    <span class="bq-option-title screen-reader-text" id="${optionHeadingId}">${escapeHtml(defaultOptionTitle)}</span>
                    <input type="text" class="bq-option-inline-name" name="bq_steps[${stepIndex}][options][${optionIndex}][title]" value="${escapeAttr(optionData.title || '')}" required data-heading="#${optionHeadingId}" data-default="${escapeAttr(defaultOptionTitle)}" placeholder="Label" />
                    <select name="bq_steps[${stepIndex}][options][${optionIndex}][price_type]" class="bq-price-type" data-price-target="#${priceWrapperId}">
                        ${PRICE_TYPES.map((type) => `<option value="${type.value}" ${priceType === type.value ? 'selected' : ''}>${type.label}</option>`).join('')}
                    </select>
                    <div class="bq-price-value ${showPriceField ? '' : 'is-hidden'}" id="${priceWrapperId}">
                        <input type="number" step="0.01" name="bq_steps[${stepIndex}][options][${optionIndex}][price_value]" value="${escapeAttr(typeof priceValue !== 'undefined' ? priceValue : '')}" placeholder="Pricing" />
                    </div>
                    <div class="bq-option-actions">
                        <button type="button" class="button-icon bq-option-toggle" aria-expanded="false" title="More settings">
                            <span class="dashicons dashicons-admin-generic" aria-hidden="true"></span>
                            <span class="screen-reader-text">More settings</span>
                        </button>
                        <button type="button" class="button-icon bq-duplicate-option" title="Duplicate">
                            <span class="dashicons dashicons-admin-page" aria-hidden="true"></span>
                            <span class="screen-reader-text">Duplicate option</span>
                        </button>
                        <button type="button" class="button-icon bq-remove-option" title="Remove">
                            <span class="dashicons dashicons-trash" aria-hidden="true"></span>
                            <span class="screen-reader-text">Remove option</span>
                        </button>
                    </div>
                </div>
                <div class="bq-option-details is-collapsed">
                    <div class="layer-inputs" data-step="${stepIndex}" data-option="${optionIndex}"></div>
                    <div class="bq-layer-toolbar">
                        <label class="bq-skip-layer-toggle">
                            <input type="checkbox" class="bq-skip-layer-input" name="bq_steps[${stepIndex}][options][${optionIndex}][skip_layers]" value="1" ${skipLayers ? 'checked' : ''} />
                            Hide this option's layers in preview
                        </label>
                        <button type="button" class="button bq-add-layer" data-step="${stepIndex}" data-option="${optionIndex}">Add layer</button>
                    </div>
                    <div class="bq-quantity-controls">
                        <label>
                            <input type="checkbox" class="bq-quantity-enabled" name="bq_steps[${stepIndex}][options][${optionIndex}][quantity_enabled]" value="1" ${quantityEnabled ? 'checked' : ''} />
                            Enable quantity selector for this option
                        </label>
                        <label class="bq-quantity-max">
                            Max quantity (0 = unlimited)
                            <input type="number" name="bq_steps[${stepIndex}][options][${optionIndex}][max_quantity]" min="0" step="1" value="${maxQuantity}" />
                        </label>
                        <div class="bq-quantity-visuals" data-step="${stepIndex}" data-option="${optionIndex}">
                            <p class="description">Optional: set image per quantity level (1,2,3...). Last image repeats for higher quantities.</p>
                        </div>
                        <button type="button" class="button bq-add-qty-visual" data-step="${stepIndex}" data-option="${optionIndex}">Add quantity image</button>
                    </div>
                </div>
            </div>
        `);

        $options.append(option);
        option.attr('data-preview-ready', skipPreview ? '0' : '1');
        option.attr('data-layers-built', '0');
        option.attr('data-layers-payload', JSON.stringify(layersPayload));
        option.attr('data-quantity-visuals', JSON.stringify(quantityLayers));
        if (!skipRefresh) {
            refreshOptionChips($step);
        }
        toggleOptionDetails(option, false);
    }

    function addLayer(stepIndex, optionIndex, layerData = {}, options = {}) {
        const $optionWrapper = $steps.find(`.bq-option[data-step-index="${stepIndex}"][data-option-index="${optionIndex}"]`);
        if (!$optionWrapper.length) {
            return;
        }
        const skipEnsure = options && options.skipEnsure === true;
        if (!skipEnsure) {
            const isBuilt = $optionWrapper.attr('data-layers-built') === '1';
            let payloadHasData = false;
            if (!isBuilt) {
                try {
                    const parsedPayload = JSON.parse($optionWrapper.attr('data-layers-payload') || '[]');
                    payloadHasData = Array.isArray(parsedPayload) && parsedPayload.length > 0;
                } catch (_error) {
                    payloadHasData = false;
                }
            }
            if (!isBuilt && payloadHasData) {
                ensureOptionLayersBuilt($optionWrapper);
            } else {
                $optionWrapper.attr('data-layers-built', '1');
            }
        }
        const $layerContainer = $optionWrapper.find(`.layer-inputs[data-step="${stepIndex}"][data-option="${optionIndex}"]`);
        if (!$layerContainer.length) {
            return;
        }
        const skipOpen = options && options.skipOpen === true;
        const skipPreview = options && options.skipPreview === true;
        const skipFocus = options && options.skipFocus === true;
        if (!skipOpen) {
            toggleOptionDetails($optionWrapper, true);
        }

        const layerIndex = $layerContainer.find('.bq-layer-row').length;
        const uniqueSuffix = `${stepIndex}-${optionIndex}-${layerIndex}-${Date.now()}`;
        const inputId = `bq-layer-${uniqueSuffix}`;
        const previewId = `bq-layer-preview-${uniqueSuffix}`;
        let layerUrl = '';
        let layerPrice = '';

        if (typeof layerData === 'string') {
            layerUrl = layerData;
        } else if (layerData && typeof layerData === 'object') {
            layerUrl = layerData.url || '';
            layerPrice = typeof layerData.price_delta !== 'undefined' ? layerData.price_delta : (layerData.price || '');
        }

        const layer = $(`
            <div class="bq-layer-row">
                <input type="text" id="${inputId}" data-preview-target="#${previewId}" name="bq_steps[${stepIndex}][options][${optionIndex}][layers][${layerIndex}][url]" value="${escapeAttr(layerUrl)}" placeholder="Layer image URL (transparent PNG)" />
                <input type="number" step="0.01" name="bq_steps[${stepIndex}][options][${optionIndex}][layers][${layerIndex}][price_delta]" value="${escapeAttr(typeof layerPrice !== 'undefined' ? layerPrice : '')}" placeholder="Price delta" />
                <div class="bq-layer-preview" id="${previewId}" aria-live="polite"></div>
                <div class="bq-layer-actions">
                    <button type="button" class="button-link bq-remove-layer">Remove</button>
                    <button type="button" class="button bq-select-image" data-target="#${inputId}">Select image</button>
                </div>
            </div>
        `);

        $layerContainer.append(layer);
        if (!skipPreview) {
            refreshLayerPreview(layer.find(`#${inputId}`));
            if (!skipFocus) {
                focusLayerInputs(stepIndex, optionIndex);
            }
        }
    }

    function refreshInlinePreview($input) {
        if (!$input || !$input.length) {
            return;
        }
        const $row = $input.closest('.bq-inline-row');
        const $preview = $row.find('.bq-inline-preview');
        if (!$preview.length) {
            return;
        }
        const url = ($input.val() || '').trim();
        $preview.find('.bq-inline-preview__placeholder').remove();
        if (url) {
            const $img = $('<img>', {
                src: url,
                alt: 'Preview',
                class: 'bq-inline-preview__thumb',
                loading: 'lazy',
            });
            $preview.find('img').remove();
            $preview.prepend($img);
        } else {
            $preview.find('img').remove();
            $preview.prepend('<span class="bq-inline-preview__placeholder">No image</span>');
        }
    }

    function addQuantityVisual(stepIndex, optionIndex, value) {
        const $option = $steps.find(`.bq-option[data-step-index="${stepIndex}"][data-option-index="${optionIndex}"]`);
        const $container = $option.find('.bq-quantity-visuals');
        if (!$container.length) {
            return;
        }
        const rowCount = $container.find('.bq-inline-row').length;
        const inputName = `bq_steps[${stepIndex}][options][${optionIndex}][quantity_layers][${rowCount}][url]`;
        const priceName = `bq_steps[${stepIndex}][options][${optionIndex}][quantity_layers][${rowCount}][price_delta]`;
        const fieldId = `bq-qty-${stepIndex}-${optionIndex}-${rowCount}-${Date.now()}`;
        const row = buildUrlInputRow(inputName, priceName, value || '', 'bq-inline-row', `Quantity ${rowCount + 1} image URL`, `#${fieldId}`);
        const $row = $(row);
        $row.find('input[type="text"]').attr('id', fieldId);
        $container.append($row);
        refreshInlinePreview($row.find('input[type="text"]'));
    }

    function ensureOptionLayersBuilt($option) {
        if (!$option || !$option.length) {
            return;
        }
        if ($option.attr('data-layers-built') === '1') {
            return;
        }
        const rawPayload = $option.attr('data-layers-payload') || '[]';
        let layers = [];
        try {
            layers = JSON.parse(rawPayload);
            if (!Array.isArray(layers)) {
                layers = [];
            }
        } catch (_error) {
            layers = [];
        }
        if (!layers.length) {
            layers = [{}];
        }
        const stepIndex = parseInt($option.data('step-index'), 10);
        const optionIndex = parseInt($option.data('option-index'), 10);
        layers.forEach(function (layer) {
            addLayer(stepIndex, optionIndex, layer, { skipPreview: true, skipEnsure: true, skipOpen: true, skipFocus: true });
        });
        $option.attr('data-layers-built', '1');

        // Build quantity visuals lazily.
        const rawQty = $option.attr('data-quantity-visuals') || '[]';
        let visuals = [];
        try {
            visuals = JSON.parse(rawQty);
            if (!Array.isArray(visuals)) {
                visuals = [];
            }
        } catch (_error) {
            visuals = [];
        }
        if (visuals.length) {
            visuals.forEach(function (item, idx) {
                addQuantityVisual(stepIndex, optionIndex, item && (item.url || item.price_delta) ? item : '');
            });
        }
    }

    function duplicateOption($option) {
        if (!$option.length) {
            return;
        }

        const data = serializeOptionFields($option);
        const stepIndex = parseInt($option.data('step-index'), 10);
        addOption(stepIndex, data);
    }

    function duplicateStep($step) {
        if (!$step.length) {
            return;
        }
        const stepData = serializeStepFields($step);
        if (!stepData) {
            return;
        }
        const clonedData = JSON.parse(JSON.stringify(stepData));
        addStep(clonedData, $step);
    }

    function serializeOptionFields($option) {
        const priceInput = $option.find('.bq-price-value input');
        const priceValue = priceInput.length ? (priceInput.val() || '') : '';
        const skipLayersInput = $option.find('.bq-skip-layer-input').first();
        const skipLayers = skipLayersInput.length ? skipLayersInput.is(':checked') : false;
        const layersBuilt = $option.attr('data-layers-built') === '1';
        const quantityEnabledInput = $option.find('.bq-quantity-enabled').first();
        const maxQuantityInput = $option.find('.bq-quantity-max input').first();
        const quantityEnabled = quantityEnabledInput.length ? quantityEnabledInput.is(':checked') : false;
        const maxQuantity = maxQuantityInput.length ? (parseInt(maxQuantityInput.val(), 10) || 0) : 0;
        let layers = [];
        if (layersBuilt) {
            $option.find('.bq-layer-row').each(function () {
                const $row = $(this);
                const url = $row.find('input[name*="[url]"]').val() || '';
                const price = $row.find('input[name*="[price_delta]"]').val();
                if (url) {
                    layers.push({
                        url: url,
                        price_delta: price || 0,
                    });
                }
            });
        } else {
            const rawPayload = $option.attr('data-layers-payload') || '[]';
            try {
                const parsed = JSON.parse(rawPayload);
                if (Array.isArray(parsed)) {
                    layers = parsed;
                }
            } catch (_error) {
                layers = [];
            }
        }
        let quantityLayers = [];
        const $qtyRows = $option.find('.bq-quantity-visuals .bq-inline-row');
        if ($qtyRows.length) {
            $qtyRows.each(function () {
                const url = $(this).find('input[type="hidden"]').val() || '';
                const price = $(this).find('input[type="number"]').val();
                if (url) {
                    quantityLayers.push({ url: url, price_delta: price || 0 });
                }
            });
        } else {
            try {
                const raw = $option.attr('data-quantity-visuals') || '[]';
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    quantityLayers = parsed;
                }
            } catch (_error) {
                quantityLayers = [];
            }
        }
        const data = {
            title: $option.find('input[name*="[title]"]').first().val() || '',
            price_type: $option.find('.bq-price-type').val() || 'none',
            price_value: priceValue,
            price_delta: priceValue,
            layers: layers,
            skip_layers: skipLayers,
            quantity_enabled: quantityEnabled,
            max_quantity: maxQuantity,
            quantity_layers: quantityLayers,
        };

        return data;
    }

    function serializeStepFields($step) {
        if (!$step || !$step.length) {
            return null;
        }

        const $stepTitleInput = $step.find('.bq-step-grid input[name*="[title]"]').first();
        const title = $stepTitleInput.length ? ($stepTitleInput.val() || '') : '';
        const inputType = $step.find('.bq-input-type').first().val() || 'radio';
        const selection = $step.find('.bq-selection-value').first().val() || 'single';
        const maxSelectionsRaw = $step.find('.bq-max-selections').first().val();
        const maxSelections = parseInt(maxSelectionsRaw, 10);
        const choiceSource = $step.find('.bq-choice-source').first().val() || 'custom';
        const attribute = $step.find('.bq-attribute-select').first().val() || '';
        const dependencyOperator = $step.find('.bq-dependency-operator').first().val() || 'all';
        const dependencyJsonField = $step.find('.bq-dependency-json').first();
        const dependencyJson = dependencyJsonField.length ? dependencyJsonField.val() : '';
        const requiredField = $step.find('.bq-dependency-required input[type="checkbox"]').first();
        const required = requiredField.length ? requiredField.is(':checked') : false;
        let dependencyRules = [];
        if (dependencyJson) {
            try {
                dependencyRules = JSON.parse(dependencyJson);
            } catch (_error) {
                dependencyRules = [];
            }
        }

        const options = [];
        $step.find('.bq-option').each(function () {
            const optionData = serializeOptionFields($(this));
            options.push(JSON.parse(JSON.stringify(optionData)));
        });

        return {
            title: title,
            input_type: inputType,
            selection: selection,
            max_selections: isNaN(maxSelections) ? 0 : Math.max(0, maxSelections),
            choice_source: choiceSource,
            attribute: attribute,
            required: required,
            dependency_operator: dependencyOperator,
            dependency_rules: dependencyRules,
            options: options,
        };
    }

    function collectAllSteps() {
        const list = [];
        $steps.find('.bq-step').each(function () {
            const data = serializeStepFields($(this));
            if (!data) {
                return;
            }
            let normalized = data;
            try {
                normalized = JSON.parse(JSON.stringify(data));
            } catch (_error) {
                normalized = data;
            }
            list.push(normalized);
        });
        return list;
    }

    function refreshLayerPreview($input) {
        if (!$input || !$input.length) {
            return;
        }
        const selector = $input.data('preview-target');
        const $preview = selector ? $(selector) : $input.closest('.bq-layer-row').find('.bq-layer-preview').first();
        if (!$preview.length) {
            return;
        }
        const url = ($input.val() || '').trim();
        if (url) {
            const $img = $('<img>', {
                src: url,
                alt: 'Layer preview',
                class: 'bq-layer-preview__thumb',
                loading: 'lazy',
            });
            $preview.empty().append($img);
        } else {
            $preview.html('<span class="bq-layer-preview__placeholder">No image selected</span>');
        }
    }

    function handleFormSubmit() {
        const stepsData = collectAllSteps();
        let payloadSet = false;
        if ($payloadField.length) {
            try {
                $payloadField.val(JSON.stringify(stepsData));
                payloadSet = true;
            } catch (_error) {
                $payloadField.val('');
            }
        }
        if (payloadSet) {
            $steps.find('input[name], select[name], textarea[name]').each(function () {
                const $field = $(this);
                if ($payloadField.length && $field.is($payloadField)) {
                    return;
                }
                $field.prop('disabled', true);
            });
        }
    }

    function setStepCollapsedState($step, shouldCollapse) {
        if (!$step || !$step.length) {
            return;
        }
        const collapsed = shouldCollapse === true;
        $step.toggleClass('is-collapsed', collapsed);
        const $btn = $step.find('.bq-toggle-step').first();
        if ($btn.length) {
            $btn.attr('aria-expanded', (!collapsed).toString());
            $btn.text(collapsed ? 'Expand' : 'Collapse');
        }
    }

    function toggleOptionDetails($option, forceOpen) {
        if (!$option || !$option.length) {
            return;
        }
        const $details = $option.find('.bq-option-details');
        const $toggle = $option.find('.bq-option-toggle');
        const currentlyOpen = $details.hasClass('is-open');
        const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !currentlyOpen;
        if (shouldOpen) {
            ensureOptionLayersBuilt($option);
        }
        $details.toggleClass('is-open', shouldOpen).toggleClass('is-collapsed', !shouldOpen);
        if (shouldOpen) {
            $details.css('max-height', $details.prop('scrollHeight') + 40 + 'px');
            if ($option.attr('data-preview-ready') !== '1') {
                refreshOptionPreviews($option);
                $option.attr('data-preview-ready', '1');
            }
        } else {
            $details.css('max-height', '');
        }
        if ($toggle.length) {
            $toggle.attr('aria-expanded', shouldOpen ? 'true' : 'false');
        }
    }

    function refreshOptionPreviews($option) {
        $option.find('.bq-layer-row input[name*="[url]"]').each(function () {
            refreshLayerPreview($(this));
        });
    }

    function focusLayerInputs(stepIndex, optionIndex) {
        const $option = $steps.find(`.bq-option[data-step-index="${stepIndex}"][data-option-index="${optionIndex}"]`);
        if (!$option.length) {
            return;
        }
        toggleOptionDetails($option, true);
        const $inputs = $option.find('.bq-layer-inputs');
        if (!$inputs.length) {
            return;
        }
        setTimeout(function () {
            const container = $inputs.get(0);
            if (container && container.scrollIntoView) {
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            const $first = $inputs.find('input[type="text"]').first();
            if ($first.length) {
                $first.focus();
            }
        }, 100);
    }

    function handleInputTypeChange($select) {
        const $step = $select.closest('.bq-step');
        if (!$step.length) {
            return;
        }

        syncSelectionMode($step);
    }

    function handleSelectionModeChange($select) {
        const $step = $select.closest('.bq-step');
        if (!$step.length) {
            return;
        }

        const value = $select.val() === 'multiple' ? 'multiple' : 'single';
        const $hidden = $step.find('.bq-selection-value');
        $hidden.val(value);

        const type = $step.find('.bq-input-type').val() || 'radio';
        const targetSelector = $select.data('mode-target');
        const maxValue = parseInt($step.find('.bq-max-selections').val(), 10) || 0;
        const labelText = (value === 'multiple' && maxValue > 0)
            ? `Up to ${maxValue} selections`
            : getSelectionLabel(type, value);
        if (targetSelector) {
            $step.find(targetSelector).text(labelText);
        } else {
            $step.find('.bq-step-mode').text(labelText);
        }

        const $maxControl = $step.find('.bq-max-selections');
        if ($maxControl.length) {
            const shouldDisable = value !== 'multiple' || ['text_input', 'text_label', 'custom_price'].includes(type);
            $maxControl.prop('disabled', shouldDisable);
        }
    }

    function syncSelectionMode($step) {
        if (!$step || !$step.length) {
            return;
        }

        const type = $step.find('.bq-input-type').val() || 'radio';
        const $selectionControl = $step.find('.bq-selection-mode');
        const $hidden = $step.find('.bq-selection-value');
        if (!$selectionControl.length || !$hidden.length) {
            return;
        }

        let value = $selectionControl.val() === 'multiple' ? 'multiple' : 'single';
        let lock = false;
        if (type === 'checkboxes') {
            value = 'multiple';
            lock = true;
        } else if (['text_input', 'text_label', 'custom_price'].includes(type)) {
            value = 'single';
            lock = true;
        }

        $selectionControl.val(value);
        $selectionControl.prop('disabled', lock);
        $hidden.val(value);

        const targetSelector = $selectionControl.data('mode-target');
        const maxValue = parseInt($step.find('.bq-max-selections').val(), 10) || 0;
        const labelText = (value === 'multiple' && maxValue > 0)
            ? `Up to ${maxValue} selections`
            : getSelectionLabel(type, value);
        if (targetSelector) {
            $step.find(targetSelector).text(labelText);
        } else {
            $step.find('.bq-step-mode').text(labelText);
        }

        const $maxControl = $step.find('.bq-max-selections');
        if ($maxControl.length) {
            const shouldDisable = value !== 'multiple' || ['text_input', 'text_label', 'custom_price'].includes(type);
            $maxControl.prop('disabled', shouldDisable);
        }
    }

    function handleChoiceSourceChange($select) {
        const $step = $select.closest('.bq-step');
        if (!$step.length) {
            return;
        }

        const value = $select.val();
        $step.find('.bq-attribute-field').toggleClass('is-hidden', value !== 'attribute');
    }

    function handlePriceTypeChange($select) {
        const targetSelector = $select.data('price-target');
        const show = ['fixed', 'percentage', 'quantity'].includes($select.val());
        $(targetSelector).toggleClass('is-hidden', !show);
    }

    function openMediaFrame($target) {
        const frame = wp.media({
            title: 'Select image',
            library: { type: 'image' },
            multiple: false,
        });

        frame.on('select', function () {
            const attachment = frame.state().get('selection').first().toJSON();
            $target.val(attachment.url).trigger('change');
        });

        frame.open();
    }

    function createDependencyPanel(stepIndex, stepData = {}) {
        const operator = stepData.dependency_operator || 'all';
        const requiredFlag = stepData.required ? 'checked' : '';
        const panel = $(`
            <div class="bq-dependency-panel">
                <div class="bq-dependency-header">
                    <strong>Conditional logic</strong>
                    <select name="bq_steps[${stepIndex}][dependency_operator]" class="bq-dependency-operator">
                        <option value="all" ${operator === 'all' ? 'selected' : ''}>Show only when all rules match</option>
                        <option value="any" ${operator === 'any' ? 'selected' : ''}>Show when any rule matches</option>
                    </select>
                </div>
                <div class="bq-dependency-rows" data-step="${stepIndex}"></div>
                <div class="bq-dependency-actions">
                    <button type="button" class="button button-small bq-add-dependency" data-step="${stepIndex}">+ Add rule</button>
                </div>
                <input type="hidden" name="bq_steps[${stepIndex}][dependency_rules]" class="bq-dependency-json" value="" />
                <label class="bq-dependency-required">
                    <input type="checkbox" name="bq_steps[${stepIndex}][required]" value="1" ${requiredFlag}>
                    This step is required when visible
                </label>
            </div>
        `);

        const rules = Array.isArray(stepData.dependency_rules) ? stepData.dependency_rules : [];
        rules.forEach(function (rule) {
            addDependencyRow(stepIndex, rule, panel);
        });

        panel.find('.bq-dependency-operator').on('change', function () {
            syncDependencyRules(panel);
        });

        panel.on('click', '.bq-add-dependency', function () {
            const step = parseInt($(this).data('step'), 10);
            addDependencyRow(step, {}, panel);
        });

        panel.on('change', '.bq-dependency-step-select', function () {
            const $row = $(this).closest('.bq-dependency-row');
            populateDependencyOptions($row, $(this).val());
            syncDependencyRules(panel);
        });

        panel.on('change', '.bq-dependency-option-select', function () {
            syncDependencyRules(panel);
        });

        panel.on('click', '.bq-remove-dependency', function () {
            $(this).closest('.bq-dependency-row').remove();
            syncDependencyRules(panel);
        });

        return panel;
    }

    function addDependencyRow(stepIndex, rule = {}, panel) {
        const $rows = panel.find('.bq-dependency-rows');
        const row = $(`
            <div class="bq-dependency-row">
                <select class="bq-dependency-step-select">
                    <option value="">Select step</option>
                </select>
                <select class="bq-dependency-option-select">
                    <option value="">Select option</option>
                </select>
                <button type="button" class="button-link bq-remove-dependency">Remove</button>
            </div>
        `);

        row.data('rule', rule);
        $rows.append(row);
        populateDependencyRow(row, stepIndex);
        syncDependencyRules(panel);
    }

    function populateDependencyRow($row, stepIndex) {
        const $stepSelect = $row.find('.bq-dependency-step-select');
        const $optionSelect = $row.find('.bq-dependency-option-select');
        const storedRule = $row.data('rule') || {};
        const previousStepValue = $stepSelect.val();
        const previousOptionValue = $optionSelect.val();
        const targetStep = typeof storedRule.step !== 'undefined' ? storedRule.step : previousStepValue;
        const options = getPriorSteps(stepIndex);
        let html = '<option value="">Select step</option>';
        options.forEach(function (entry) {
            const isSelected = String(targetStep) === String(entry.index);
            html += `<option value="${entry.index}" ${isSelected ? 'selected' : ''}>Step ${entry.index + 1} Aï¿½ ${escapeHtml(entry.title)}</option>`;
        });
        $stepSelect.html(html);
        if (targetStep !== undefined && targetStep !== null && targetStep !== '') {
            $stepSelect.val(String(targetStep));
        }
        const selectedStep = $stepSelect.val();
        const targetOption = typeof storedRule.option !== 'undefined' ? storedRule.option : previousOptionValue;
        populateDependencyOptions($row, selectedStep, targetOption);
        $row.removeData('rule');
    }

    function populateDependencyOptions($row, stepValue, selectedOption) {
        const $optionSelect = $row.find('.bq-dependency-option-select');
        if (stepValue === '' || stepValue === null || typeof stepValue === 'undefined') {
            $optionSelect.html('<option value="">Select option</option>');
            return;
        }

        const stepOptions = getStepOptions(parseInt(stepValue, 10));
        const targetOption = typeof selectedOption !== 'undefined' ? selectedOption : $optionSelect.val();
        let normalizedTarget = '';
        if (typeof targetOption !== 'undefined' && targetOption !== null) {
            normalizedTarget = String(targetOption);
        }
        const isAnySelected = normalizedTarget === 'any';
        let html = '<option value="">Select option</option>';
        html += `<option value="any" ${isAnySelected ? 'selected' : ''}>Any choice</option>`;
        stepOptions.forEach(function (opt) {
            const isSelected = normalizedTarget === String(opt.index);
            html += `<option value="${opt.index}" ${isSelected ? 'selected' : ''}>${escapeHtml(opt.title)}</option>`;
        });
        $optionSelect.html(html);
        if (normalizedTarget) {
            $optionSelect.val(normalizedTarget);
        }
    }

    function getPriorSteps(stepIndex) {
        const list = [];
        $steps.find('.bq-step').each(function (idx) {
            if (idx >= stepIndex) {
                return;
            }
            const title = $(this).find('.bq-step-title h3').text().trim() || `Step ${idx + 1}`;
            list.push({
                index: idx,
                title: title,
            });
        });
        return list;
    }

    function getStepOptions(stepIndex) {
        const list = [];
        const $step = $steps.find(`.bq-step[data-step-index="${stepIndex}"]`);
        $step.find('.bq-option').each(function (idx) {
            const titleInput = $(this).find('input[name*="[title]"]').first();
            const title = titleInput.length ? titleInput.val().trim() : '';
            list.push({
                index: idx,
                title: title || `Option ${idx + 1}`,
            });
        });
        return list;
    }

    function syncDependencyRules(panel) {
        const rules = [];
        panel.find('.bq-dependency-row').each(function () {
            const $row = $(this);
            const stepValue = $row.find('.bq-dependency-step-select').val();
            const optionValue = $row.find('.bq-dependency-option-select').val();
            if (!stepValue || optionValue === '') {
                return;
            }
            const step = parseInt(stepValue, 10);
            if (Number.isNaN(step)) {
                return;
            }
            let option = null;
            if (optionValue === 'any') {
                option = 'any';
            } else {
                const parsedOption = parseInt(optionValue, 10);
                if (Number.isNaN(parsedOption)) {
                    return;
                }
                option = parsedOption;
            }
            rules.push({
                step: step,
                option: option,
            });
        });
        panel.find('.bq-dependency-json').val(JSON.stringify(rules));
    }

    function getPanelDependencyRules(panel) {
        const $jsonField = panel.find('.bq-dependency-json').first();
        if (!$jsonField.length) {
            return [];
        }
        const raw = $jsonField.val() || '[]';
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            return [];
        }
    }

    function cloneRule(rule) {
        if (!rule || typeof rule !== 'object') {
            return rule;
        }
        try {
            return JSON.parse(JSON.stringify(rule));
        } catch (_error) {
            return {
                step: rule.step,
                option: rule.option,
            };
        }
    }

    function reindexStepFieldNames($step, idx) {
        $step.attr('data-step-index', idx);
        $step.find('[name]').each(function () {
            const $field = $(this);
            const name = $field.attr('name');
            if (!name || name.indexOf('bq_steps[') === -1) {
                return;
            }
            $field.attr('name', name.replace(/bq_steps\[\d+\]/, `bq_steps[${idx}]`));
        });
        $step.find('.bq-input-type, .bq-selection-mode, .bq-choice-source').attr('data-step-index', idx);
        $step.find('.bq-options').attr('data-step-index', idx);
        $step.find('.bq-add-option, .bq-add-step-inline').attr('data-step', idx);
        $step.find('.bq-dependency-rows').attr('data-step', idx);
        $step.find('.bq-add-dependency').attr('data-step', idx);
    }

    function reindexOptions($step, stepIndex) {
        $step.find('.bq-option').each(function (optIdx) {
            const $option = $(this);
            $option.attr('data-step-index', stepIndex);
            $option.attr('data-option-index', optIdx);
            $option.find('.bq-option-chip').text(`Option ${optIdx + 1}`);
            $option.find('.layer-inputs').attr('data-step', stepIndex).attr('data-option', optIdx);
            $option.find('.bq-add-layer').attr('data-step', stepIndex).attr('data-option', optIdx);
            $option.find('[name]').each(function () {
                const $field = $(this);
                if ($field.closest('.bq-layer-row').length) {
                    return;
                }
                const name = $field.attr('name');
                if (!name || name.indexOf('bq_steps[') === -1) {
                    return;
                }
                let updated = name.replace(/bq_steps\[\d+\]/, `bq_steps[${stepIndex}]`);
                updated = updated.replace(/options\]\[\d+\]/, `options][${optIdx}]`);
                $field.attr('name', updated);
            });
            reindexLayers($option, stepIndex, optIdx);
        });
    }

    function reindexLayers($option, stepIndex, optionIndex) {
        $option.find('.bq-layer-row').each(function (layerIdx) {
            const $row = $(this);
            $row.find('[name]').each(function () {
                const $field = $(this);
                const name = $field.attr('name');
                if (!name || name.indexOf('bq_steps[') === -1) {
                    return;
                }
                let updated = name.replace(/bq_steps\[\d+\]/, `bq_steps[${stepIndex}]`);
                updated = updated.replace(/options\]\[\d+\]/, `options][${optionIndex}]`);
                updated = updated.replace(/layers\]\[\d+\]/, `layers][${layerIdx}]`);
                $field.attr('name', updated);
            });
        });
    }

    function refreshDependencyOptions() {
        $steps.find('.bq-step').each(function (idx) {
            const $step = $(this);
            reindexStepFieldNames($step, idx);
            reindexOptions($step, idx);
            $step.find('.bq-dependency-panel').each(function () {
                const $panel = $(this);
                const storedRules = getPanelDependencyRules($panel);
                $panel.find('.bq-dependency-row').each(function (rowIdx) {
                    if (storedRules[rowIdx]) {
                        $(this).data('rule', cloneRule(storedRules[rowIdx]));
                    }
                    populateDependencyRow($(this), idx);
                });
                syncDependencyRules($panel);
            });
        });
    }

    function refreshStepNumbers() {
        $steps.find('.bq-step').each(function (idx) {
            $(this).find('.bq-step-number').text(idx + 1);
        });
        refreshDependencyOptions();
    }

    function refreshOptionChips($step) {
        if (!$step || !$step.length) {
            return;
        }
        refreshDependencyOptions();
    }

    function escapeHtml(value) {
        if (!value) {
            return '';
        }
        return value
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeAttr(value) {
        if (!value) {
            return '';
        }
        return escapeHtml(value).replace(/"/g, '&quot;');
    }

    function escapeTextarea(value) {
        if (!value) {
            return '';
        }
        return value.toString().replace(/</g, '&lt;');
    }

    function getSelectionLabel(inputType, selectionMode) {
        switch (inputType) {
            case 'checkboxes':
                return 'Multiple selections allowed';
            case 'image_buttons':
                return 'Choose an image';
            case 'text_input':
                return 'Customer text input';
            case 'text_label':
                return 'Informational step';
            case 'custom_price':
                return 'Customer defined price';
            default:
                return selectionMode === 'multiple' ? 'Multiple selections allowed' : 'Select one option';
        }
    }

    $(document).ready(function () {
        init();
    });
})(jQuery);






