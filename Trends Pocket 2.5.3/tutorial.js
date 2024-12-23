class TrendsPocketTutorial {
    constructor() {
        this.currentStep = 0;
        this.isActive = false;
        this.steps = [
            {
                element: '.main-menu',
                title: 'Main Navigation',
                content: 'Navigate between different sections: Trends to see current trends, Search to analyze specific keywords, and Filter to filter results.',
                position: 'bottom',
                section: 'trends'
            },
            {
                element: '#countrySelect',
                title: 'Country Selection',
                content: 'Choose the country for which you want to see trends. Data updates automatically.',
                position: 'bottom',
                section: 'trends'
            },
            {
                element: '.trends-table',
                title: 'Trends Analysis',
                content: 'Explore current trending topics, their search volume, and when they started trending.',
                position: 'top',
                section: 'trends'
            },
            {
                element: '.search-section .search-container',
                title: 'Search Functionality',
                content: 'Enter keywords to analyze their search trends over time.',
                position: 'bottom',
                section: 'search'
            },
            {
                element: '.trends-container',
                title: 'Trend Visualizations',
                content: 'Analyze trends with detailed charts showing time evolution and geographic distribution.',
                position: 'top',
                section: 'search'
            },
            {
                element: '#filterSection .search-container',
                title: 'Filter Options',
                content: 'Filter the current trends displayed in Google Trends\' Trending Now section with specific keywords or themes.',
                position: 'bottom',
                section: 'filter'
            },
            {
                element: '#historyFavorites',
                title: 'History and Favorites',
                content: 'Find your previous searches and mark your favorite keywords for quick access.',
                position: 'top',
                section: 'filter'
            },
            {
                element: '.settings-container',
                title: 'Settings',
                content: 'Customize language and enable Google Search popup to see trends directly during your searches.',
                position: 'top-left',
                section: 'filter'
            }
        ];

        this.init();
    }

    init() {
        // Check if first use
        chrome.storage.local.get(['tutorialCompleted'], (result) => {
            if (!result.tutorialCompleted) {
                this.start();
            }
        });
    }

    switchSection(sectionName) {
        // Remove active class from all menu items
        document.querySelectorAll('.main-menu-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to selected menu item
        document.getElementById(`${sectionName}MenuItem`).classList.add('active');
        
        // Hide all sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        
        // Show selected section
        document.getElementById(`${sectionName}Section`).classList.add('active');
    }

    createOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'tutorial-overlay';
        document.body.appendChild(overlay);
        return overlay;
    }

    createHighlight(element) {
        const highlight = document.createElement('div');
        highlight.className = 'tutorial-highlight';
        
        const rect = element.getBoundingClientRect();
        highlight.style.top = `${rect.top}px`;
        highlight.style.left = `${rect.left}px`;
        highlight.style.width = `${rect.width}px`;
        highlight.style.height = `${rect.height}px`;
        
        document.body.appendChild(highlight);
        return highlight;
    }

    createBubble(step) {
        const bubble = document.createElement('div');
        bubble.className = 'tutorial-bubble';
        
        const content = `
            <div class="tutorial-progress">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span>Step ${this.currentStep + 1}/${this.steps.length}</span>
                    <button class="tutorial-skip" data-action="skip" style="font-size: 10px; color: #5f6368; background: none; border: none; padding: 0; margin: 0; cursor: pointer; text-decoration: underline;">Skip tutorial</button>
                </div>
                <div class="tutorial-dots">
                    ${this.steps.map((_, i) => `
                        <div class="tutorial-dot ${i === this.currentStep ? 'active' : ''}"></div>
                    `).join('')}
                </div>
            </div>
            <div class="tutorial-content">
                <strong>${step.title}</strong><br>
                ${step.content}
            </div>
            <div class="tutorial-buttons">
                ${this.currentStep > 0 ? `
                    <button class="tutorial-button secondary" data-action="prev">Previous</button>
                ` : `
                    <span></span>
                `}
                <button class="tutorial-button primary" data-action="${this.currentStep === this.steps.length - 1 ? 'finish' : 'next'}">
                    ${this.currentStep === this.steps.length - 1 ? 'Finish' : 'Next'}
                </button>
            </div>
        `;
        
        bubble.innerHTML = content;
        document.body.appendChild(bubble);
        
        // Position the bubble
        const element = document.querySelector(step.element);
        const rect = element.getBoundingClientRect();
        const bubbleRect = bubble.getBoundingClientRect();
        
        let top, left;
        switch(step.position) {
            case 'bottom':
                top = rect.bottom + 10;
                left = rect.left + (rect.width / 2) - (bubbleRect.width / 2);
                break;
            case 'top':
                top = rect.top - bubbleRect.height - 10;
                left = rect.left + (rect.width / 2) - (bubbleRect.width / 2);
                break;
            case 'top-left':
                top = rect.top - bubbleRect.height - 10;
                left = rect.left;
                break;
        }
        
        // Keep bubble within window bounds
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        if (left < 10) left = 10;
        if (left + bubbleRect.width > windowWidth - 10) {
            left = windowWidth - bubbleRect.width - 10;
        }
        if (top < 10) top = rect.bottom + 10;
        if (top + bubbleRect.height > windowHeight - 10) {
            top = rect.top - bubbleRect.height - 10;
        }
        
        bubble.style.top = `${top}px`;
        bubble.style.left = `${left}px`;
        
        this.addBubbleListeners(bubble);
        return bubble;
    }

    addBubbleListeners(bubble) {
        bubble.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (!action) return;
            
            switch(action) {
                case 'prev':
                    this.previousStep();
                    break;
                case 'next':
                    this.nextStep();
                    break;
                case 'skip':
                case 'finish':
                    this.finish();
                    break;
            }
        });
    }

    showStep() {
        this.cleanup();
        
        const step = this.steps[this.currentStep];
        
        // Switch to the correct section before showing the step
        this.switchSection(step.section);
        
        // Add min-height to filterSection if we're showing settings
        if (step.element === '.settings-container') {
            document.getElementById('filterSection').style.minHeight = '600px';
        }
        
        // Wait a bit for the section switch animation to complete
        setTimeout(() => {
            const element = document.querySelector(step.element);
            
            if (!element) {
                console.error(`Element not found: ${step.element}`);
                return;
            }
            
            this.overlay = this.createOverlay();
            this.highlight = this.createHighlight(element);
            this.bubble = this.createBubble(step);
        }, 300);
    }

    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.showStep();
        }
    }

    previousStep() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.showStep();
        }
    }

    cleanup() {
        const elements = document.querySelectorAll('.tutorial-overlay, .tutorial-highlight, .tutorial-bubble');
        elements.forEach(el => el.remove());
        
        // Reset filterSection min-height
        const filterSection = document.getElementById('filterSection');
        if (filterSection) {
            filterSection.style.minHeight = '';
        }
    }

    start() {
        this.isActive = true;
        this.currentStep = 0;
        this.showStep();
    }

    finish() {
        this.isActive = false;
        this.cleanup();
        chrome.storage.local.set({ tutorialCompleted: true });
        
        // Return to first tab (Trends)
        this.switchSection('trends');
    }
}

// Initialize tutorial
document.addEventListener('DOMContentLoaded', () => {
    window.trendsPocketTutorial = new TrendsPocketTutorial();
});