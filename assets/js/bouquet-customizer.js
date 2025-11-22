function toLayerArray(rawLayers) {
    if (Array.isArray(rawLayers)) {
        return rawLayers;
    }

    if (!rawLayers) {
        return [];
    }

    if (typeof rawLayers === 'object') {
        const directKeys = ['url', 'image', 'src', 'image_url', 'imageUrl', 'layer_url', 'layerUrl', 'link', 'value', 'path'];
        const hasDirectShape = directKeys.some(function (key) {
            return typeof rawLayers[key] !== 'undefined' && rawLayers[key] !== null;
        });
        if (hasDirectShape) {
            return [rawLayers];
        }

        return Object.keys(rawLayers).map(function (key) {
            return rawLayers[key];
        });
    }

    if (typeof rawLayers === 'string') {
        return [rawLayers];
    }

    return [];
}

function resolveLayerUrl(entry) {
    if (!entry) {
        return '';
    }

    if (typeof entry === 'string') {
        return entry;
    }

    if (typeof entry === 'object') {
        const keys = ['url', 'image', 'src', 'image_url', 'imageUrl', 'layer_url', 'layerUrl', 'link', 'value', 'path'];
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (entry[key]) {
                return entry[key];
            }
        }
    }

    return '';
}

function resolveLayerPrice(entry) {
    if (!entry || typeof entry === 'string') {
        return 0;
    }

    const keys = ['price_delta', 'priceDelta', 'price', 'delta', 'cost', 'amount'];
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (typeof entry[key] !== 'undefined' && entry[key] !== null && entry[key] !== '') {
            const value = parseFloat(entry[key]);
            if (!isNaN(value)) {
                return value;
            }
        }
    }

    return 0;
}

function normalizeLayersList(rawLayers) {
    const normalized = [];
    const entries = toLayerArray(rawLayers);
    entries.forEach(function (entry) {
        const url = resolveLayerUrl(entry);
        if (!url) {
            return;
        }

        normalized.push({
            url: url,
            price_delta: resolveLayerPrice(entry),
        });
    });
    return normalized;
}

function getLayerPriceTotal(layers) {
    if (!Array.isArray(layers)) {
        return 0;
    }

    return layers.reduce(function (sum, layer) {
        return sum + (parseFloat(layer.price_delta) || 0);
    }, 0);
}

function escapeHtml(value) {
    if (!value) {
        return '';
    }
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}

function getInputType(step) {
    const allowed = ['radio', 'checkboxes', 'image_buttons', 'text_input', 'text_label', 'custom_price'];
    const type = (step && step.input_type) ? step.input_type : null;
    if (type && allowed.indexOf(type) >= 0) {
        return type;
    }
    if (step && step.selection === 'multiple') {
        return 'checkboxes';
    }
    return 'radio';
}

function getMaxSelections(step) {
    if (!step) {
        return 0;
    }
    const raw = typeof step.max_selections !== 'undefined'
        ? step.max_selections
        : (typeof step.maxSelections !== 'undefined'
            ? step.maxSelections
            : (step.maxSelection || 0));
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? 0 : parsed;
}

function stepRequiresSelection(step) {
    if ( ! step ) {
        return false;
    }

    if ( step.required === false || step.required === 'false' || step.required === '0' || step.required === 0 ) {
        return false;
    }

    const type = getInputType(step);
    return ['text_label'].indexOf(type) === -1;
}

function formatOptionPriceLabel(type, value, formatCurrencyFn) {
    switch (type) {
        case 'fixed':
            return '+' + formatCurrencyFn(value || 0);
        case 'percentage':
            return '+' + (parseFloat(value) || 0) + '%';
        case 'quantity':
            return '+' + formatCurrencyFn(value || 0) + ' per qty';
        case 'custom':
            return 'Customer price';
        default:
            return '';
    }
}

function safeParseJSON(value, fallback) {
    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function toArrayLike(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (!value) {
        return [];
    }

    if (typeof value === 'string') {
        const parsed = safeParseJSON(value, null);
        if (parsed !== null && typeof parsed !== 'undefined') {
            return toArrayLike(parsed);
        }
        return [];
    }

    if (typeof value === 'object') {
        return Object.keys(value).map(function (key) {
            return value[key];
        });
    }

    return [];
}

function extractDependencyIndex(rule, keys) {
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (typeof rule[key] === 'undefined' || rule[key] === null || rule[key] === '') {
            continue;
        }
        const value = parseInt(rule[key], 10);
        if (!isNaN(value)) {
            return value;
        }
    }
    return NaN;
}

function normalizeDependencyRuleList(rules, legacy) {
    const normalized = [];
    const stepKeys = [
        'step',
        'step_index',
        'stepIndex',
        'step_id',
        'stepId',
        'parent_step',
        'parentStep',
    ];
    const optionKeys = [
        'option',
        'option_index',
        'optionIndex',
        'option_id',
        'optionId',
        'choice',
        'choice_index',
        'choiceIndex',
    ];
    const isAnyValue = function (value) {
        return typeof value === 'string' && value.trim().toLowerCase() === 'any';
    };

    toArrayLike(rules).forEach(function (rule) {
        if (typeof rule === 'string') {
            const parts = rule.split(':');
            if (parts.length === 2) {
                const stepValue = parseInt(parts[0], 10);
                if (isNaN(stepValue) || stepValue < 0) {
                    return;
                }
                const optionRaw = (parts[1] || '').trim();
                if (isAnyValue(optionRaw)) {
                    normalized.push({
                        step: stepValue,
                        option: 'any',
                    });
                    return;
                }
                const optionValue = parseInt(optionRaw, 10);
                if (!isNaN(optionValue) && optionValue >= 0) {
                    normalized.push({
                        step: stepValue,
                        option: optionValue,
                    });
                }
            }
            return;
        }

        if (!rule || typeof rule !== 'object') {
            return;
        }
        const step = extractDependencyIndex(rule, stepKeys);
        if (isNaN(step) || step < 0) {
            return;
        }

        let optionValue = null;
        let optionIsAny = false;
        for (let i = 0; i < optionKeys.length; i++) {
            const key = optionKeys[i];
            if (typeof rule[key] === 'undefined' || rule[key] === null || rule[key] === '') {
                continue;
            }
            if (isAnyValue(rule[key])) {
                optionIsAny = true;
                optionValue = 'any';
                break;
            }
            const parsed = parseInt(rule[key], 10);
            if (!isNaN(parsed)) {
                optionValue = parsed;
                break;
            }
        }

        if (optionValue === null) {
            return;
        }

        if (!optionIsAny) {
            if (isNaN(optionValue) || optionValue < 0) {
                return;
            }
        }

        normalized.push({
            step: step,
            option: optionIsAny ? 'any' : optionValue,
        });
    });

    if (!normalized.length && typeof legacy === 'string' && legacy.indexOf(':') !== -1) {
        const parts = legacy.split(':');
        const step = parseInt(parts[0], 10);
        if (!isNaN(step) && step >= 0) {
            const optionRaw = (parts[1] || '').trim();
            if (isAnyValue(optionRaw)) {
                normalized.push({
                    step: step,
                    option: 'any',
                });
            } else {
                const option = parseInt(optionRaw, 10);
                if (!isNaN(option) && option >= 0) {
                    normalized.push({
                        step: step,
                        option: option,
                    });
                }
            }
        }
    }

    return normalized;
}

function getSelectionLabel(type, selectionMode) {
    switch (type) {
        case 'checkboxes':
            return 'Select multiple';
        case 'image_buttons':
            return 'Choose an image';
        case 'text_input':
            return 'Customer text input';
        case 'text_label':
            return 'Information';
        case 'custom_price':
            return 'Customer defined price';
        default:
            return selectionMode === 'multiple' ? 'Select multiple' : 'Select one option';
    }
}

(function () {
    if ( typeof bqFrontendData === 'undefined' ) {
        return;
    }

    const restBase = bqFrontendData.restUrl;
    const nonce = bqFrontendData.nonce;
    const restNonce = bqFrontendData.restNonce || bqFrontendData.nonce;
    const productId = parseInt( bqFrontendData.productId, 10 );
    const basePrice = parseFloat( bqFrontendData.basePrice ) || 0;
    const cartUrl = bqFrontendData.cartUrl || '';
    let initialConfigCache = null;
    if ( bqFrontendData.initialConfig ) {
        try {
            initialConfigCache = JSON.parse( JSON.stringify( bqFrontendData.initialConfig ) );
        } catch ( error ) {
            initialConfigCache = null;
        }
    }
    const modal = document.getElementById( 'bq-customizer-modal' );
    const openButton = document.querySelector( '.bq-open-customizer' );

    if ( ! modal || ! openButton || ! productId ) {
        return;
    }

    const formatter = window.Intl
        ? new Intl.NumberFormat( undefined, {
              style: 'currency',
              currency: bqFrontendData.currencyCode || 'USD',
          } )
        : null;

    const previewStack = modal.querySelector( '.bq-preview-stack' );
    const canvas = modal.querySelector( '#bq-preview-canvas' );
    const totalDisplay = modal.querySelector( '.bq-total-price-value' );
    const submitButton = modal.querySelector( '.bq-submit-config' );
    const stepContainer = modal.querySelector( '.bq-step-list' );
    const closeButtons = [ ...modal.querySelectorAll( '.bq-customizer-close, .bq-customizer-backdrop' ) ];

    let config = null;
    let selectedOptions = {};

    stepContainer.addEventListener( 'input', function ( event ) {
        if ( event.target.classList.contains( 'bq-text-input-field' ) ) {
            handleTextInputChange( event.target );
        }
        if ( event.target.classList.contains( 'bq-custom-price-field' ) ) {
            handleCustomPriceChange( event.target );
        }
    } );

    stepContainer.addEventListener( 'change', function ( event ) {
        if ( event.target.classList.contains( 'bq-custom-price-field' ) ) {
            handleCustomPriceChange( event.target );
        }
    } );

    function formatCurrency( value ) {
        const amount = parseFloat( value ) || 0;
        if ( formatter ) {
            return formatter.format( amount );
        }
        const symbol = bqFrontendData.currencySymbol || '$';
        return symbol + amount.toFixed( 2 );
    }

    function resetState() {
        selectedOptions = {};
        previewStack.innerHTML = '';
        if ( canvas && canvas.getContext ) {
            const ctx = canvas.getContext( '2d' );
            ctx.clearRect( 0, 0, canvas.width, canvas.height );
        }
        if ( totalDisplay ) {
            totalDisplay.textContent = formatCurrency( basePrice );
        }
        submitButton.disabled = true;
    }

    function openModal() {
        modal.removeAttribute( 'hidden' );
        modal.classList.add( 'is-open' );
        document.body.classList.add( 'bq-modal-open' );
    }

    function closeModal() {
        modal.setAttribute( 'hidden', 'true' );
        modal.classList.remove( 'is-open' );
        document.body.classList.remove( 'bq-modal-open' );
        resetState();
    }

    async function fetchConfig() {
        if ( initialConfigCache ) {
            try {
                return JSON.parse( JSON.stringify( initialConfigCache ) );
            } catch ( error ) {
                return initialConfigCache;
            }
        }

        const url = `${ restBase }/config/${ productId }`;
        const response = await fetch( url, {
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': restNonce,
            },
        } );
        if ( ! response.ok ) {
            let message = 'Unable to load customization data.';
            try {
                const errorBody = await response.json();
                if ( errorBody && errorBody.message ) {
                    message = errorBody.message;
                }
            } catch ( error ) {
                // Ignore JSON parse errors.
            }
            throw new Error( message );
        }
        return response.json();
    }

    function getStepSelections( stepIndex ) {
        if ( ! selectedOptions[ stepIndex ] ) {
            selectedOptions[ stepIndex ] = {};
        }
        return selectedOptions[ stepIndex ];
    }

    function clearStepSelections( stepIndex ) {
        if ( selectedOptions[ stepIndex ] ) {
            delete selectedOptions[ stepIndex ];
        }
    }

    function stepHasSelection( stepIndex ) {
        return !! ( selectedOptions[ stepIndex ] && Object.keys( selectedOptions[ stepIndex ] ).length );
    }

    function enforceMaxSelections( stepIndex ) {
        const stepCard = modal.querySelector( `.bq-step-card[data-step-index="${ stepIndex }"]` );
        if ( ! stepCard ) {
            return;
        }
        const selectionMode = stepCard.dataset.selection || 'single';
        if ( selectionMode !== 'multiple' ) {
            return;
        }

        const maxSelections = parseInt( stepCard.dataset.maxSelections || '0', 10 ) || 0;
        if ( maxSelections <= 0 ) {
            stepCard.querySelectorAll( '.bq-option-card' ).forEach( function ( button ) {
                button.style.display = '';
                button.disabled = false;
            } );
            const note = stepCard.querySelector( '.bq-max-note' );
            if ( note ) {
                note.textContent = '';
            }
            return;
        }

        const currentCount = Object.keys( getStepSelections( stepIndex ) ).length;
        const atLimit = currentCount >= maxSelections;

        const note = stepCard.querySelector( '.bq-max-note' );
        if ( note ) {
            if ( currentCount > 0 ) {
                const remaining = Math.max( 0, maxSelections - currentCount );
                note.textContent = atLimit
                    ? `You can choose up to ${ maxSelections } options in this step.`
                    : `You can choose up to ${ maxSelections } options in this step. (${ remaining } left)`;
            } else {
                note.textContent = '';
            }
        }

        stepCard.querySelectorAll( '.bq-option-card' ).forEach( function ( button ) {
            const isActive = button.classList.contains( 'is-active' );
            if ( atLimit && ! isActive ) {
                button.style.display = 'none';
                button.disabled = true;
            } else {
                button.style.display = '';
                button.disabled = false;
            }
        } );
    }

    function collectSelections() {
        const selections = [];
        Object.keys( selectedOptions )
            .sort( function ( a, b ) {
                return parseInt( a, 10 ) - parseInt( b, 10 );
            } )
            .forEach( function ( stepIndex ) {
                const options = selectedOptions[ stepIndex ];
                Object.keys( options )
                    .sort( function ( a, b ) {
                        return parseInt( a, 10 ) - parseInt( b, 10 );
                    } )
                    .forEach( function ( optionIndex ) {
                        selections.push( options[ optionIndex ] );
                    } );
            } );
        return selections;
    }

    function renderSteps() {
        stepContainer.innerHTML = '';
        if ( ! config || ! Array.isArray( config.steps ) || ! config.steps.length ) {
            stepContainer.innerHTML = '<p class="bq-error">No steps configured for this bouquet.</p>';
            return;
        }

        const isMobileLayout = window.matchMedia && window.matchMedia( '(max-width: 640px)' ).matches;

        config.steps.forEach( function ( step, index ) {
            const stepCard = document.createElement( 'div' );
            const selectionMode = step.selection === 'multiple' ? 'multiple' : 'single';
            const inputType = getInputType( step );
            const maxSelections = selectionMode === 'multiple' ? getMaxSelections( step ) : 1;
            const selectionLabel = ( selectionMode === 'multiple' && maxSelections > 0 )
                ? `Up to ${ maxSelections } selections`
                : getSelectionLabel( inputType, selectionMode );
            const requiresSelection = stepRequiresSelection( step );

            stepCard.className = 'bq-step-card';
            stepCard.dataset.stepIndex = index;
            stepCard.dataset.stepTitle = step.title || '';
            stepCard.dataset.selection = selectionMode;
            stepCard.dataset.inputType = inputType;
            stepCard.dataset.requiresSelection = requiresSelection ? 'true' : 'false';
            stepCard.dataset.stepRequired = step.required ? 'true' : 'false';
            stepCard.dataset.maxSelections = maxSelections || 0;
            stepCard.dataset.totalOptions = ( step.options || [] ).length || 0;

            let dependencySource;
            if (typeof step.dependency_rules !== 'undefined') {
                dependencySource = step.dependency_rules;
            } else if (typeof step.dependencyRules !== 'undefined') {
                dependencySource = step.dependencyRules;
            } else if (typeof step.conditions !== 'undefined') {
                dependencySource = step.conditions;
            } else if (typeof step.condition_rules !== 'undefined') {
                dependencySource = step.condition_rules;
            } else if (typeof step.conditional_rules !== 'undefined') {
                dependencySource = step.conditional_rules;
            } else {
                dependencySource = [];
            }
            const dependencyLegacy = step.dependency
                || step.condition
                || step.legacy_dependency
                || '';
            const rulePayload = normalizeDependencyRuleList( dependencySource, dependencyLegacy );
            const dependencyOperator = typeof step.dependency_operator !== 'undefined'
                ? step.dependency_operator
                : ( step.dependencyOperator || step.conditional_operator || 'all' );

            stepCard.dataset.dependencyRules = JSON.stringify( rulePayload );
            stepCard.dataset.dependencyLegacy = dependencyLegacy;
            stepCard.dataset.dependencyOperator = ( dependencyOperator || 'all' ).toLowerCase() === 'any' ? 'any' : 'all';
            if ( isMobileLayout ) {
                stepCard.innerHTML = `
                    <div class="bq-step-header">
                        <button type="button" class="bq-step-nav-btn bq-step-nav-btn--prev" aria-label="Previous options">
                            <span aria-hidden="true">&larr;</span>
                        </button>
                        <div class="bq-step-title-wrap">
                            <h3>${ escapeHtml( step.title || 'Untitled Step' ) }</h3>
                            <span class="bq-step-title-underline" aria-hidden="true"></span>
                            <span class="bq-step-count"><span class="bq-step-count-current">0</span>/<span class="bq-step-count-total">${ ( step.options || [] ).length }</span></span>
                        </div>
                        <button type="button" class="bq-step-nav-btn bq-step-nav-btn--next" aria-label="Next options">
                            <span aria-hidden="true">&rarr;</span>
                        </button>
                    </div>
                    <div class="bq-step-subheader">
                        <span class="bq-step-mode-pill">${ selectionLabel }</span>
                        <span class="bq-step-active-label" aria-live="polite"></span>
                    </div>
                    <p class="bq-max-note" aria-live="polite"></p>
                    <div class="bq-step-options"></div>
                `;
            } else {
                stepCard.innerHTML = `
                    <div class="bq-step-header">
                        <div>
                            <h3>${ escapeHtml( step.title || 'Untitled Step' ) }</h3>
                        </div>
                        <span class="bq-step-mode-pill">${ selectionLabel }</span>
                    </div>
                    <p class="bq-max-note" aria-live="polite"></p>
                    <div class="bq-step-options"></div>
                `;
            }

            const optionsWrap = stepCard.querySelector( '.bq-step-options' );
            ( step.options || [] ).forEach( function ( option, optionIndex ) {
                const element = createOptionElement( step, option, index, optionIndex );
                if ( element ) {
                    optionsWrap.appendChild( element );
                }
            } );

            if ( isMobileLayout ) {
                const prevBtn = stepCard.querySelector( '.bq-step-nav-btn--prev' );
                const nextBtn = stepCard.querySelector( '.bq-step-nav-btn--next' );
                if ( prevBtn && nextBtn ) {
                    prevBtn.addEventListener( 'click', function () {
                        scrollStepOptions( stepCard, -1 );
                    } );
                    nextBtn.addEventListener( 'click', function () {
                        scrollStepOptions( stepCard, 1 );
                    } );
                }

                if ( optionsWrap ) {
                    optionsWrap.addEventListener( 'scroll', function () {
                        updateStepNavState( index );
                    } );
                }
            }

            stepContainer.appendChild( stepCard );
        } );

        applyDependencies();
        updateSubmitState();
        config.steps.forEach( function ( _step, idx ) {
            enforceMaxSelections( idx );
            if ( isMobileLayout ) {
                updateStepNavState( idx );
            }
        } );

        if ( ! stepContainer.dataset.qtyHandlerBound ) {
            stepContainer.addEventListener( 'click', function ( event ) {
                const qtyBtn = event.target.closest( '.bq-qty-btn' );
                if ( qtyBtn ) {
                    event.stopPropagation();
                    const dir = parseInt( qtyBtn.dataset.dir, 10 ) || 0;
                    adjustOptionQuantity( qtyBtn, dir );
                }
            } );
            stepContainer.dataset.qtyHandlerBound = '1';
        }
    }

    function scrollStepOptions( stepCard, direction ) {
        if ( ! stepCard ) {
            return;
        }
        const wrap = stepCard.querySelector( '.bq-step-options' );
        if ( ! wrap ) {
            return;
        }
        const delta = ( wrap.clientWidth || 0 ) * 0.8 || 160;
        wrap.scrollBy( {
            left: direction > 0 ? delta : -delta,
            behavior: 'smooth',
        } );
        setTimeout( function () {
            updateStepNavState( stepCard.dataset.stepIndex );
        }, 200 );
    }

    function updateStepNavState( stepIndex ) {
        const stepCard = modal.querySelector( `.bq-step-card[data-step-index="${ stepIndex }"]` );
        if ( ! stepCard ) {
            return;
        }

        const totalOptions = parseInt( stepCard.dataset.totalOptions || '0', 10 ) || 0;
        const totalEl = stepCard.querySelector( '.bq-step-count-total' );
        if ( totalEl ) {
            totalEl.textContent = totalOptions;
        }

        const selections = selectedOptions[ stepIndex ] || {};
        const selectionKeys = Object.keys( selections );
        const activeKey = selectionKeys.length ? selectionKeys[0] : null;
        const currentIndex = activeKey !== null ? ( parseInt( activeKey, 10 ) + 1 ) : 0;
        const currentEl = stepCard.querySelector( '.bq-step-count-current' );
        if ( currentEl ) {
            currentEl.textContent = currentIndex;
        }

        const labelEl = stepCard.querySelector( '.bq-step-active-label' );
        if ( labelEl ) {
            labelEl.textContent = activeKey !== null && selections[ activeKey ]
                ? ( selections[ activeKey ].optionTitle || '' )
                : '';
        }

        const wrap = stepCard.querySelector( '.bq-step-options' );
        const prevBtn = stepCard.querySelector( '.bq-step-nav-btn--prev' );
        const nextBtn = stepCard.querySelector( '.bq-step-nav-btn--next' );
        if ( wrap && prevBtn && nextBtn ) {
            const atStart = wrap.scrollLeft <= 4;
            const atEnd = ( wrap.scrollLeft + wrap.clientWidth ) >= ( wrap.scrollWidth - 4 );
            prevBtn.disabled = atStart;
            nextBtn.disabled = atEnd;
        }
    }

    function createOptionElement( step, option, stepIndex, optionIndex ) {
        const inputType = getInputType( step );
        const normalizedLayers = normalizeLayersList( option.layers );
        const skipLayers = option.skip_layers === true || option.skip_layers === 1 || option.skip_layers === '1';
        const effectiveLayers = skipLayers ? [] : normalizedLayers;
        const priceType = option.price_type || 'none';
        const priceValue = typeof option.price_value !== 'undefined' ? option.price_value : ( option.price_delta || 0 );
        const entryPreview = {
            priceType: priceType,
            priceValue: priceValue,
            optionPriceDelta: option.price_delta || 0,
            layers: effectiveLayers,
        };
        const estimatedDelta = calculatePriceDelta( entryPreview );
        const priceLabel = formatOptionPriceLabel( priceType, priceValue, formatCurrency );

        if ( 'text_input' === inputType ) {
            const wrapper = document.createElement( 'div' );
            wrapper.className = 'bq-text-input-control';
            wrapper.innerHTML = `
                <label>
                    <span>${ escapeHtml( option.title || 'Enter text' ) }</span>
                    <input type="text" class="bq-text-input-field" data-step-index="${ stepIndex }" data-option-index="${ optionIndex }" />
                </label>
            `;
            return wrapper;
        }

        if ( 'custom_price' === inputType ) {
            const wrapper = document.createElement( 'div' );
            wrapper.className = 'bq-text-input-control';
            wrapper.innerHTML = `
                <label>
                    <span>${ escapeHtml( option.title || 'Name your price' ) }</span>
                    <input type="number" min="0" step="0.01" class="bq-custom-price-field" data-step-index="${ stepIndex }" data-option-index="${ optionIndex }" />
                </label>
            `;
            return wrapper;
        }

        if ( 'text_label' === inputType ) {
            const block = document.createElement( 'div' );
            block.className = 'bq-text-label';
            block.innerHTML = `
                <strong>${ escapeHtml( option.title || step.title || '' ) }</strong>
            `;
            return block;
        }

        const button = document.createElement( 'button' );
        button.type = 'button';
        button.className = 'bq-option-card';
        if ( 'image_buttons' === inputType ) {
            button.classList.add( 'is-image' );
        }
        button.dataset.stepIndex = stepIndex;
        button.dataset.optionIndex = optionIndex;
        button.dataset.stepTitle = step.title || '';
        button.dataset.optionTitle = option.title || '';
        button.dataset.priceType = priceType;
        button.dataset.priceValue = priceValue;
        button.dataset.optionPriceDelta = option.price_delta || 0;
        button.dataset.layers = JSON.stringify( effectiveLayers );
        button.dataset.selection = step.selection || 'single';
        button.dataset.priceDelta = estimatedDelta;
        button.dataset.skipLayers = skipLayers ? '1' : '0';
        button.dataset.quantityEnabled = option.quantity_enabled ? '1' : '0';
        button.dataset.maxQuantity = option.max_quantity || 0;
        button.dataset.quantityLayers = JSON.stringify( Array.isArray( option.quantity_layers ) ? option.quantity_layers : [] );
        button.dataset.quantity = '1';

        const imageSrc = normalizedLayers[0] ? normalizedLayers[0].url : '';
        const swatchColor = option.swatch_color || option.swatchColor || option.color || option.colour || '';
        const imageMarkup = imageSrc ? `<span class="bq-option-media"><img src="${ imageSrc }" alt="${ escapeHtml( option.title || '' ) }" /></span>` : '';
        const swatchMarkup = ( swatchColor || imageSrc )
            ? `<span class="bq-option-swatch"${ swatchColor ? ` style="background:${ escapeHtml( swatchColor ) }"` : '' }>${ imageSrc ? `<img src="${ imageSrc }" alt="${ escapeHtml( option.title || '' ) }" />` : '' }</span>`
            : '';
        const priceText = priceLabel || ( estimatedDelta ? '+' + formatCurrency( estimatedDelta ) : '' );
        button.dataset.priceLabel = priceText;
        const quantityControls = button.dataset.quantityEnabled === '1'
            ? `<div class="bq-option-qty" data-step-index="${ stepIndex }" data-option-index="${ optionIndex }">
                    <span class="bq-qty-btn" data-dir="-1" role="button" tabindex="0" aria-label="Decrease quantity">-</span>
                    <span class="bq-qty-value">1</span>
                    <span class="bq-qty-btn" data-dir="1" role="button" tabindex="0" aria-label="Increase quantity">+</span>
               </div>`
            : '';

        button.innerHTML = `
            <div class="bq-option-card__primary">
                ${ imageMarkup }
                ${ swatchMarkup }
                <span class="bq-option-card__title">${ escapeHtml( option.title || 'Option' ) }</span>
                <span class="bq-option-card__price">${ priceText }</span>
            </div>
            ${ quantityControls }
        `;

        button.addEventListener( 'click', function () {
            selectOption( button );
        } );

        return button;
    }

    function calculatePriceDelta( entry ) {
        const layersTotal = getLayerPriceTotal( entry.layers );
        const priceType = entry.priceType || 'none';
        const value = parseFloat( entry.priceValue ) || 0;
        let base = 0;

        switch ( priceType ) {
            case 'fixed':
                base = value;
                break;
            case 'percentage':
                base = basePrice * ( value / 100 );
                break;
            case 'quantity':
                base = value * ( entry.quantity || 1 );
                break;
            case 'custom':
                base = parseFloat( entry.customPrice || 0 ) || 0;
                break;
            default:
                base = parseFloat( entry.optionPriceDelta || 0 ) || 0;
                break;
        }

        return base + layersTotal;
    }

    function selectOption( element ) {
        const stepIndex = element.dataset.stepIndex;
        const optionIndex = element.dataset.optionIndex;
        const stepCard = element.closest( '.bq-step-card' );
        const stepData = config.steps && config.steps[ stepIndex ] ? config.steps[ stepIndex ] : {};
        const inputType = stepCard ? ( stepCard.dataset.inputType || getInputType( stepData ) ) : getInputType( stepData );
        const selectionMode = stepCard ? stepCard.dataset.selection || 'single' : 'single';
        const maxSelections = selectionMode === 'multiple'
            ? ( parseInt( stepCard ? ( stepCard.dataset.maxSelections || '0' ) : getMaxSelections( stepData ), 10 ) || 0 )
            : 1;
        let layersRaw = safeParseJSON( element.dataset.layers || '[]', [] );
        const normalizedLayers = normalizeLayersList( layersRaw );
        const quantityEnabled = element.dataset.quantityEnabled === '1';
        const maxQuantity = parseInt( element.dataset.maxQuantity || '0', 10 ) || 0;
        const quantityLayers = safeParseJSON( element.dataset.quantityLayers || '[]', [] );
        const baseQuantity = quantityEnabled ? Math.max( 1, parseInt( element.dataset.quantity || '1', 10 ) || 1 ) : 1;

        const skipLayers = element.dataset.skipLayers === '1';
        const effectiveLayers = getLayersForQuantity( normalizedLayers, quantityLayers, baseQuantity );
        const entry = {
            stepIndex: parseInt( stepIndex, 10 ),
            optionIndex: parseInt( optionIndex, 10 ),
            stepTitle: element.dataset.stepTitle || '',
            optionTitle: element.dataset.optionTitle || '',
            priceType: element.dataset.priceType || 'none',
            priceValue: parseFloat( element.dataset.priceValue || 0 ) || 0,
            optionPriceDelta: parseFloat( element.dataset.optionPriceDelta || 0 ) || 0,
            layers: effectiveLayers,
            inputType: inputType,
            displayImage: normalizedLayers[0] ? normalizedLayers[0].url : '',
            color: element.dataset.color || '',
            skipLayers: skipLayers,
            quantity: baseQuantity,
            quantityEnabled: quantityEnabled,
            maxQuantity: maxQuantity,
        };
        entry.layerPriceDelta = getLayerPriceTotal( effectiveLayers );
        entry.priceDelta = calculatePriceDelta( entry ) * ( quantityEnabled ? baseQuantity : 1 );

        if ( selectionMode === 'single' ) {
            clearStepSelections( stepIndex );
            if ( stepCard ) {
                stepCard.querySelectorAll( '.bq-option-card' ).forEach( function ( option ) {
                    option.classList.remove( 'is-active' );
                } );
            }
            getStepSelections( stepIndex )[ optionIndex ] = entry;
            element.classList.add( 'is-active' );
        } else {
            const stepSelections = getStepSelections( stepIndex );
            const isActive = element.classList.contains( 'is-active' );
            const currentCount = Object.keys( stepSelections ).length;
            if ( ! isActive && maxSelections > 0 && currentCount >= maxSelections ) {
                alert( `You can select up to ${ maxSelections } option${ maxSelections === 1 ? '' : 's' } for this step.` );
                return;
            }
            if ( isActive ) {
                element.classList.remove( 'is-active' );
                delete stepSelections[ optionIndex ];
                if ( ! stepHasSelection( stepIndex ) ) {
                    clearStepSelections( stepIndex );
                }
            } else {
                element.classList.add( 'is-active' );
                stepSelections[ optionIndex ] = entry;
            }
        }

        applyDependencies();
        updateSubmitState();
        updatePriceDisplay();
        updatePreviewStack();
        enforceMaxSelections( stepIndex );
        updateStepNavState( stepIndex );
    }

    function getLayersForQuantity( baseLayers, quantityLayers, quantity ) {
        if ( ! quantity || ! Array.isArray( quantityLayers ) || ! quantityLayers.length ) {
            return baseLayers;
        }
        const target = quantityLayers[ quantity - 1 ] || quantityLayers[ quantityLayers.length - 1 ];
        const normalized = normalizeLayersList( target );
        return normalized.length ? normalized : baseLayers;
    }

    function adjustOptionQuantity( buttonEl, delta ) {
        const optionCard = buttonEl.closest( '.bq-option-card' );
        if ( ! optionCard || optionCard.dataset.quantityEnabled !== '1' ) {
            return;
        }
        const stepIndex = optionCard.dataset.stepIndex;
        const optionIndex = optionCard.dataset.optionIndex;
        const maxQuantity = parseInt( optionCard.dataset.maxQuantity || '0', 10 ) || 0;
        const current = Math.max( 1, parseInt( optionCard.dataset.quantity || '1', 10 ) || 1 );
        let next = current + delta;
        if ( next < 1 ) {
            next = 1;
        }
        if ( maxQuantity > 0 && next > maxQuantity ) {
            next = maxQuantity;
        }
        optionCard.dataset.quantity = String( next );
        const qtyValue = optionCard.querySelector( '.bq-qty-value' );
        if ( qtyValue ) {
            qtyValue.textContent = next;
        }

        // If not selected yet, select it on increase.
        const isActive = optionCard.classList.contains( 'is-active' );
        if ( ! isActive && delta > 0 ) {
            selectOption( optionCard );
            return;
        }

        // Update existing selection entry.
        const selections = getStepSelections( stepIndex );
        const entry = selections && selections[ optionIndex ];
        if ( entry ) {
            const baseLayers = normalizeLayersList( safeParseJSON( optionCard.dataset.layers || '[]', [] ) );
            const qtyLayers = safeParseJSON( optionCard.dataset.quantityLayers || '[]', [] );
            const adjustedLayers = getLayersForQuantity( baseLayers, qtyLayers, next );
            entry.quantity = next;
            entry.layers = adjustedLayers;
            entry.layerPriceDelta = getLayerPriceTotal( adjustedLayers );
            entry.priceDelta = calculatePriceDelta( entry ) * ( entry.quantityEnabled ? next : 1 );
            selections[ optionIndex ] = entry;
            updatePreviewStack();
            updatePriceDisplay();
        }
        const priceEl = optionCard.querySelector( '.bq-option-card__price' );
        if ( priceEl ) {
            const baseLabel = optionCard.dataset.priceLabel || '';
            priceEl.textContent = baseLabel ? `${ baseLabel } x${ next }` : `Qty: ${ next }`;
        }
    }

    function handleTextInputChange( input ) {
        const stepIndex = input.dataset.stepIndex;
        const optionIndex = input.dataset.optionIndex;
        const value = input.value.trim();
        const stepData = config.steps && config.steps[ stepIndex ] ? config.steps[ stepIndex ] : {};
        const optionData = stepData.options && stepData.options[ optionIndex ] ? stepData.options[ optionIndex ] : {};

        if ( ! value ) {
            removeSelection( stepIndex, optionIndex );
            updateSubmitState();
            updatePriceDisplay();
            return;
        }

        const entry = {
            stepIndex: parseInt( stepIndex, 10 ),
            optionIndex: parseInt( optionIndex, 10 ),
            stepTitle: stepData.title || '',
            optionTitle: optionData.title || '',
            priceType: optionData.price_type || 'none',
            priceValue: optionData.price_value || 0,
            optionPriceDelta: optionData.price_delta || 0,
            layers: normalizeLayersList( optionData.layers ),
            customValue: value,
            custom_value: value,
            inputType: 'text_input',
        };

        entry.priceDelta = calculatePriceDelta( entry );
        getStepSelections( stepIndex )[ optionIndex ] = entry;
        updateSubmitState();
        updatePriceDisplay();
        updatePreviewStack();
    }

    function handleCustomPriceChange( input ) {
        const stepIndex = input.dataset.stepIndex;
        const optionIndex = input.dataset.optionIndex;
        const value = parseFloat( input.value );
        const stepData = config.steps && config.steps[ stepIndex ] ? config.steps[ stepIndex ] : {};
        const optionData = stepData.options && stepData.options[ optionIndex ] ? stepData.options[ optionIndex ] : {};

        if ( isNaN( value ) || value <= 0 ) {
            removeSelection( stepIndex, optionIndex );
            updateSubmitState();
            updatePriceDisplay();
            return;
        }

        const entry = {
            stepIndex: parseInt( stepIndex, 10 ),
            optionIndex: parseInt( optionIndex, 10 ),
            stepTitle: stepData.title || '',
            optionTitle: optionData.title || '',
            priceType: 'custom',
            priceValue: value,
            customPrice: value,
            custom_price: value,
            layers: normalizeLayersList( optionData.layers ),
            inputType: 'custom_price',
        };

        entry.priceDelta = calculatePriceDelta( entry );
        getStepSelections( stepIndex )[ optionIndex ] = entry;
        updateSubmitState();
        updatePriceDisplay();
        updatePreviewStack();
    }

    function removeSelection( stepIndex, optionIndex ) {
        const selections = selectedOptions[ stepIndex ];
        if ( selections && selections[ optionIndex ] ) {
            delete selections[ optionIndex ];
            if ( ! Object.keys( selections ).length ) {
                delete selectedOptions[ stepIndex ];
            }
        }
    }

    function applyDependencies() {
        const selections = collectSelections();

        const matches = selections.reduce(function (carry, choice) {
            const stepIndex = parseInt( choice.stepIndex, 10 );
            const optionIndex = parseInt( choice.optionIndex, 10 );
            if ( ! isNaN( stepIndex ) ) {
                carry.steps[ stepIndex ] = true;
                if ( ! isNaN( optionIndex ) ) {
                    const key = `${ stepIndex }:${ optionIndex }`;
                    carry.options[ key ] = true;
                }
            }
            return carry;
        }, { options: {}, steps: {} });

        modal.querySelectorAll( '.bq-step-card' ).forEach( function ( card ) {
            const rawRules = card.dataset.dependencyRules || '[]';
            const parsedRules = safeParseJSON( rawRules, [] );
            const legacyRule = card.dataset.dependencyLegacy || '';
            const rules = normalizeDependencyRuleList( parsedRules, legacyRule );

            if ( ! rules.length ) {
                card.classList.remove( 'is-hidden' );
                return;
            }

            const operator = card.dataset.dependencyOperator === 'any' ? 'any' : 'all';
            const ruleMatchesSelection = function ( rule ) {
                const step = parseInt( rule.step, 10 );
                if ( isNaN( step ) ) {
                    return false;
                }
                if ( rule.option === 'any' ) {
                    return Boolean( matches.steps[ step ] );
                }
                const option = parseInt( rule.option, 10 );
                if ( isNaN( option ) ) {
                    return false;
                }
                return Boolean( matches.options[ `${ step }:${ option }` ] );
            };
            const satisfied = operator === 'any'
                ? rules.some( ruleMatchesSelection )
                : rules.every( ruleMatchesSelection );

            card.classList.toggle( 'is-hidden', ! satisfied );
            if ( ! satisfied ) {
                const stepIndex = card.dataset.stepIndex;
                clearStepSelections( stepIndex );
                card.querySelectorAll( '.bq-option-card' ).forEach( function ( option ) {
                    option.classList.remove( 'is-active' );
                } );
                card.querySelectorAll( '.bq-text-input-field, .bq-custom-price-field' ).forEach( function ( field ) {
                    field.value = '';
                } );
            }

            enforceMaxSelections( card.dataset.stepIndex );
        } );
    }

    function updateSubmitState() {
        const cards = [ ...modal.querySelectorAll( '.bq-step-card:not(.is-hidden)' ) ];
        const ready = cards.length > 0 && cards.every( function ( card ) {
            if ( card.dataset.requiresSelection === 'false' ) {
                return true;
            }
            return stepHasSelection( card.dataset.stepIndex );
        } );
        submitButton.disabled = ! ready;
    }

    function updatePriceDisplay() {
        const selections = collectSelections();
        const total = selections.reduce( function ( sum, option ) {
            return sum + ( parseFloat( option.priceDelta ) || 0 );
        }, basePrice );
        if ( totalDisplay ) {
            totalDisplay.textContent = formatCurrency( total );
        }
    }

    async function updatePreviewStack() {
        previewStack.innerHTML = '';
        const layers = [];
        const selections = collectSelections();
        selections.forEach( function ( option ) {
            const skip = option.skipLayers === true
                || option.skipLayers === '1'
                || option.skipLayers === 1
                || option.skip_layers === true
                || option.skip_layers === '1'
                || option.skip_layers === 1;
            if ( skip ) {
                return;
            }
            if ( Array.isArray( option.layers ) ) {
                option.layers.forEach( function ( image ) {
                    const imageUrl = resolveLayerUrl( image );
                    if ( imageUrl ) {
                        layers.push( imageUrl );
                    }
                } );
            }
        } );

        layers.forEach( function ( url ) {
            const img = document.createElement( 'img' );
            img.src = url;
            previewStack.appendChild( img );
        } );

        if ( ! canvas || ! canvas.getContext ) {
            return;
        }

        const ctx = canvas.getContext( '2d' );
        const images = await Promise.all(
            layers.map( function ( url ) {
                return loadLayerImage( url );
            } )
        );

        ctx.clearRect( 0, 0, canvas.width, canvas.height );
        images.forEach( function ( img ) {
            if ( img ) {
                ctx.drawImage( img, 0, 0, canvas.width, canvas.height );
            }
        } );
    }

    function loadLayerImage( url ) {
        return new Promise( function ( resolve ) {
            if ( ! url ) {
                resolve( null );
                return;
            }

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
                resolve( img );
            };
            img.onerror = function () {
                resolve( null );
            };
            img.src = url;
        } );
    }

    async function handleSubmit() {
        if ( submitButton.disabled ) {
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Saving...';

        await updatePreviewStack();

        const preview = canvas ? canvas.toDataURL( 'image/png' ) : '';
        const payload = {
            nonce: nonce,
            product_id: productId,
            selected_options: collectSelections(),
            preview_image: preview,
        };

        try {
            const response = await fetch( `${ restBase }/add-to-cart`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-WP-Nonce': restNonce,
                },
                body: JSON.stringify( payload ),
            } );

            const result = await response.json();
            if ( response.ok && result.success ) {
                if ( cartUrl ) {
                    window.location.href = cartUrl;
                    return;
                }
                window.location.reload();
                return;
            }

            throw new Error( result.message || 'Unable to add bouquet to cart.' );
        } catch ( error ) {
            alert( error.message );
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Add to Cart';
        }
    }

    openButton.addEventListener( 'click', async function ( event ) {
        event.preventDefault();
        resetState();
        openModal();
        stepContainer.innerHTML = '<p class="bq-loading">Loading configuration…</p>';

        try {
            config = await fetchConfig();
            renderSteps();
            if ( totalDisplay ) {
                totalDisplay.textContent = formatCurrency( basePrice );
            }
        } catch ( error ) {
            stepContainer.innerHTML = `<p class="bq-error">${ error.message }</p>`;
        }
    } );

    closeButtons.forEach( function ( button ) {
        button.addEventListener( 'click', function () {
            closeModal();
        } );
    } );

    submitButton.addEventListener( 'click', handleSubmit );
    document.addEventListener( 'keydown', function ( event ) {
        if ( event.key === 'Escape' && ! modal.hasAttribute( 'hidden' ) ) {
            closeModal();
        }
    } );
})();
