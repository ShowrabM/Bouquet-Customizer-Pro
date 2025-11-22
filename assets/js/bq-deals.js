(function () {
    const modal = document.getElementById('bq-deal-modal');
    if (!modal) {
        return;
    }

    const backdrop = modal.querySelector('.bq-deal-modal__backdrop');
    const closeBtn = modal.querySelector('.bq-deal-modal__close');
    const titleEl = modal.querySelector('[data-field="title"]');
    const taglineEl = modal.querySelector('[data-field="tagline"]');
    const imageEl = modal.querySelector('[data-field="image"]');
    const priceEl = modal.querySelector('[data-field="price"]');
    const savingsEl = modal.querySelector('[data-field="savings"]');
    const linkEl = modal.querySelector('[data-field="link"]');
    const ctaBtn = modal.querySelector('[data-field="cta"]');
    const panels = modal.querySelectorAll('.bq-deal-panel');
    const tabs = modal.querySelectorAll('.bq-deal-tab');

    function clearPanels() {
        panels.forEach(function (panel) {
            panel.innerHTML = '';
        });
    }

    function setActiveTab(tabName) {
        tabs.forEach(function (tab) {
            const isActive = tab.dataset.tab === tabName;
            tab.classList.toggle('is-active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        panels.forEach(function (panel) {
            panel.classList.toggle('is-active', panel.dataset.panel === tabName);
        });
    }

    function renderList(list, ordered) {
        const wrapper = document.createElement(ordered ? 'ol' : 'ul');
        list.forEach(function (item) {
            const li = document.createElement('li');
            li.textContent = item;
            wrapper.appendChild(li);
        });
        return wrapper;
    }

    function renderChangelog(items) {
        const fragment = document.createDocumentFragment();
        items.forEach(function (entry) {
            const block = document.createElement('div');
            block.className = 'bq-changelog-entry';
            const title = document.createElement('h4');
            title.textContent = entry.version ? `Version ${entry.version}` : 'Changelog';
            block.appendChild(title);
            if (entry.date) {
                const date = document.createElement('p');
                date.style.marginTop = '0';
                date.style.color = '#5c6a8c';
                date.textContent = entry.date;
                block.appendChild(date);
            }
            if (entry.notes) {
                const notes = document.createElement('p');
                notes.textContent = entry.notes;
                block.appendChild(notes);
            }
            fragment.appendChild(block);
        });
        return fragment;
    }

    function populateModal(data) {
        titleEl.textContent = data.title || '';
        taglineEl.textContent = data.tagline || '';
        priceEl.textContent = data.price || '';
        savingsEl.textContent = data.savings || '';
        savingsEl.style.display = data.savings ? 'inline-flex' : 'none';

        if (imageEl) {
            if (data.image) {
                imageEl.src = data.image;
                imageEl.alt = data.title || 'Plugin logo';
                imageEl.parentElement.style.display = '';
            } else {
                imageEl.src = '';
                imageEl.alt = '';
                imageEl.parentElement.style.display = 'none';
            }
        }

        if (linkEl) {
            if (data.link) {
                linkEl.href = data.link;
                linkEl.style.display = 'inline-flex';
            } else {
                linkEl.href = '#';
                linkEl.style.display = 'none';
            }
        }

        if (ctaBtn) {
            ctaBtn.textContent = data.cta || 'Get this plugin';
            if (data.link) {
                ctaBtn.onclick = function () {
                    window.open(data.link, '_blank', 'noopener');
                };
            } else {
                ctaBtn.onclick = null;
            }
        }

        clearPanels();

        const descPanel = modal.querySelector('[data-panel="description"]');
        const installPanel = modal.querySelector('[data-panel="installation"]');
        const changelogPanel = modal.querySelector('[data-panel="changelog"]');

        if (descPanel) {
            descPanel.innerHTML = data.description || '<p>No description provided.</p>';
        }

        if (installPanel) {
            const steps = Array.isArray(data.installation) ? data.installation : [];
            if (steps.length) {
                installPanel.appendChild(renderList(steps, true));
            } else {
                installPanel.innerHTML = '<p>No installation steps provided.</p>';
            }
        }

        if (changelogPanel) {
            const items = Array.isArray(data.changelog) ? data.changelog : [];
            if (items.length) {
                changelogPanel.appendChild(renderChangelog(items));
            } else {
                changelogPanel.innerHTML = '<p>No changelog available.</p>';
            }
        }

        setActiveTab('description');
    }

    function openModal(data) {
        populateModal(data);
        modal.hidden = false;
        document.body.classList.add('bq-deal-modal-open');
    }

    function closeModal() {
        modal.hidden = true;
        document.body.classList.remove('bq-deal-modal-open');
    }

    document.addEventListener('click', function (event) {
        const trigger = event.target.closest('.bq-deal-view');
        if (trigger && trigger.dataset.deal) {
            event.preventDefault();
            try {
                const data = JSON.parse(trigger.dataset.deal);
                openModal(data);
            } catch (error) {
                console.error('Unable to open deal details', error);
            }
        }

        if (event.target.closest('.bq-deal-tab')) {
            const tab = event.target.closest('.bq-deal-tab');
            setActiveTab(tab.dataset.tab);
        }
    });

    [backdrop, closeBtn].forEach(function (el) {
        if (el) {
            el.addEventListener('click', closeModal);
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !modal.hidden) {
            closeModal();
        }
    });
})();
