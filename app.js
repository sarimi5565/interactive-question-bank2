document.addEventListener('DOMContentLoaded', () => {

    const App = (() => {
        // --- STATE MANAGEMENT ---
        let allQuestions = [];
        let filteredQuestions = [];
        const state = {
            searchTerm: '',
            topic: 'all',
            subtopic: 'all',
            difficulty: 'all',
            tags: new Set(),
            favoritesOnly: false,
            favorites: new Set(),
            isDarkMode: false,
            currentPage: 1,
            itemsPerPage: 12,
        };

        // --- DOM ELEMENTS ---
        const dom = {
            grid: document.getElementById('question-grid'),
            emptyState: document.getElementById('empty-state'),
            searchInput: document.getElementById('search-input'),
            topicFilter: document.getElementById('topic-filter'),
            subtopicFilter: document.getElementById('subtopic-filter'),
            difficultyFilter: document.getElementById('difficulty-filter'),
            favoritesToggle: document.getElementById('favorites-toggle'),
            randomBtn: document.getElementById('random-question'),
            clearBtn: document.getElementById('clear-filters'),
            themeToggle: document.getElementById('theme-toggle'),
            loadMoreBtn: document.getElementById('load-more-btn'),
        };

        // --- UTILS ---
        const utils = {
            debounce: (func, delay) => {
                let timeoutId;
                return (...args) => {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => func.apply(this, args), delay);
                };
            },
            highlightText: (text, term) => {
                if (!term) return text;
                const regex = new RegExp(`(${term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
                return text.replace(regex, `<mark>$1</mark>`);
            },
            saveState: () => {
                const stateToSave = {
                    topic: state.topic,
                    subtopic: state.subtopic,
                    difficulty: state.difficulty,
                    tags: Array.from(state.tags),
                    favoritesOnly: state.favoritesOnly,
                };
                localStorage.setItem('qb_filters', JSON.stringify(stateToSave));
                localStorage.setItem('qb_favorites', JSON.stringify(Array.from(state.favorites)));
                localStorage.setItem('qb_darkmode', state.isDarkMode);
            },
            loadState: () => {
                // Load favorites
                const storedFavorites = localStorage.getItem('qb_favorites');
                if (storedFavorites) {
                    state.favorites = new Set(JSON.parse(storedFavorites));
                }
                // Load theme
                const storedTheme = localStorage.getItem('qb_darkmode');
                state.isDarkMode = storedTheme === 'true';
                if (state.isDarkMode) document.documentElement.classList.add('dark-mode');
                
                // Load filters
                const storedFilters = localStorage.getItem('qb_filters');
                if (storedFilters) {
                    const loaded = JSON.parse(storedFilters);
                    state.topic = loaded.topic || 'all';
                    state.subtopic = loaded.subtopic || 'all';
                    state.difficulty = loaded.difficulty || 'all';
                    state.tags = new Set(loaded.tags || []);
                    state.favoritesOnly = loaded.favoritesOnly || false;
                }
            }
        };

        // --- RENDER FUNCTIONS ---
        const render = {
            questionCard: (q) => {
                const isFavorited = state.favorites.has(q.id);
                const tagsHtml = q.tags.map(tag => 
                    `<span class="tag ${state.tags.has(tag) ? 'active' : ''}" data-tag="${tag}">${utils.highlightText(tag, state.searchTerm)}</span>`
                ).join('');

                return `
                    <div class="question-card" id="card-${q.id}" data-id="${q.id}">
                        <div class="card-header">
                            <div class="topic-info">
                                <span class="topic">${utils.highlightText(q.topic, state.searchTerm)}</span> > 
                                <span class="subtopic">${utils.highlightText(q.subtopic, state.searchTerm)}</span>
                            </div>
                            <span class="difficulty ${q.difficulty}">${q.difficulty}</span>
                        </div>
                        <div class="question-content">
                            <p>${utils.highlightText(q.question_text, state.searchTerm)}</p>
                            ${q.question_images && q.question_images.map(src => `<img src="${src}" alt="Question image">`).join('')}
                        </div>
                        <div class="card-tags">${tagsHtml}</div>
                        <div class="card-footer">
                            <button class="favorite-btn ${isFavorited ? 'favorited' : ''}" data-id="${q.id}" aria-label="Toggle Favorite">⭐</button>
                            <button class="solution-toggle" data-id="${q.id}" aria-expanded="false">Show Solution</button>
                        </div>
                        <div class="solution-panel" id="solution-${q.id}"></div>
                    </div>
                `;
            },
            solutionContent: (q) => {
                const solutionVideoHtml = q.solution_video_url 
                    ? `<div class="video-container">
                        <iframe src="https://www.youtube.com/embed/${new URL(q.solution_video_url).searchParams.get('v')}" 
                                title="YouTube video player" frameborder="0" 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                allowfullscreen></iframe>
                       </div>` 
                    : '';
                
                return `
                    <h4>Solution</h4>
                    <p>${utils.highlightText(q.solution_text, state.searchTerm)}</p>
                    ${q.solution_images && q.solution_images.map(src => `<img src="${src}" alt="Solution image">`).join('')}
                    ${solutionVideoHtml}
                `;
            },
            questionGrid: () => {
                const questionsToRender = filteredQuestions.slice(0, state.currentPage * state.itemsPerPage);
                if (questionsToRender.length === 0) {
                    dom.grid.innerHTML = '';
                    dom.emptyState.style.display = 'block';
                    dom.loadMoreBtn.style.display = 'none';
                } else {
                    dom.grid.innerHTML = questionsToRender.map(render.questionCard).join('');
                    dom.emptyState.style.display = 'none';
                    dom.loadMoreBtn.style.display = filteredQuestions.length > questionsToRender.length ? 'block' : 'none';
                }
                if (window.MathJax) {
                    MathJax.typesetPromise();
                }
            },
            filters: () => {
                // Populate topics
                const topics = ['all', ...new Set(allQuestions.map(q => q.topic))];
                dom.topicFilter.innerHTML = topics.map(t => `<option value="${t}">${t === 'all' ? 'All Topics' : t}</option>`).join('');

                // Set loaded filter values
                dom.topicFilter.value = state.topic;
                render.subtopics(); // This will populate and set subtopic value
                dom.difficultyFilter.value = state.difficulty;
                dom.searchInput.value = state.searchTerm;
                if(state.favoritesOnly) dom.favoritesToggle.classList.add('active');
            },
            subtopics: () => {
                const selectedTopic = dom.topicFilter.value;
                let subtopics = ['all'];
                if (selectedTopic !== 'all') {
                    subtopics = ['all', ...new Set(allQuestions.filter(q => q.topic === selectedTopic).map(q => q.subtopic))];
                }
                dom.subtopicFilter.innerHTML = subtopics.map(s => `<option value="${s}">${s === 'all' ? 'All Subtopics' : s}</option>`).join('');
                dom.subtopicFilter.disabled = selectedTopic === 'all';
                dom.subtopicFilter.value = state.topic === selectedTopic ? state.subtopic : 'all';
            }
        };

        // --- LOGIC & ACTIONS ---
        const actions = {
            filterQuestions: () => {
                state.currentPage = 1; // Reset page on new filter
                const term = state.searchTerm.toLowerCase();
                filteredQuestions = allQuestions.filter(q => {
                    const searchMatch = term === '' ||
                        q.question_text.toLowerCase().includes(term) ||
                        q.solution_text.toLowerCase().includes(term) ||
                        q.topic.toLowerCase().includes(term) ||
                        q.subtopic.toLowerCase().includes(term) ||
                        q.tags.some(tag => tag.toLowerCase().includes(term));

                    const topicMatch = state.topic === 'all' || q.topic === state.topic;
                    const subtopicMatch = state.subtopic === 'all' || q.subtopic === state.subtopic;
                    const difficultyMatch = state.difficulty === 'all' || q.difficulty === state.difficulty;
                    const tagMatch = state.tags.size === 0 || q.tags.some(tag => state.tags.has(tag));
                    const favoriteMatch = !state.favoritesOnly || state.favorites.has(q.id);

                    return searchMatch && topicMatch && subtopicMatch && difficultyMatch && tagMatch && favoriteMatch;
                });
                render.questionGrid();
                utils.saveState();
            },
            toggleSolution: (id) => {
                const solutionPanel = document.getElementById(`solution-${id}`);
                const toggleButton = document.querySelector(`.solution-toggle[data-id="${id}"]`);
                if (solutionPanel.classList.contains('visible')) {
                    solutionPanel.classList.remove('visible');
                    toggleButton.textContent = 'Show Solution';
                    toggleButton.setAttribute('aria-expanded', 'false');
                    solutionPanel.innerHTML = ''; // Clear content
                } else {
                    const question = allQuestions.find(q => q.id === id);
                    solutionPanel.innerHTML = render.solutionContent(question);
                    solutionPanel.classList.add('visible');
                    toggleButton.textContent = 'Hide Solution';
                    toggleButton.setAttribute('aria-expanded', 'true');
                    if (window.MathJax) {
                        MathJax.typesetPromise([solutionPanel]);
                    }
                }
            },
            toggleFavorite: (id) => {
                const btn = document.querySelector(`.favorite-btn[data-id="${id}"]`);
                if (state.favorites.has(id)) {
                    state.favorites.delete(id);
                    btn.classList.remove('favorited');
                } else {
                    state.favorites.add(id);
                    btn.classList.add('favorited');
                }
                if (state.favoritesOnly) {
                    actions.filterQuestions();
                }
                utils.saveState();
            },
            pickRandom: () => {
                if (filteredQuestions.length === 0) return;
                const randomIndex = Math.floor(Math.random() * filteredQuestions.length);
                const randomQuestion = filteredQuestions[randomIndex];
                const card = document.getElementById(`card-${randomQuestion.id}`);
                
                if (card) {
                    // Close all other open solutions
                    document.querySelectorAll('.solution-panel.visible').forEach(panel => {
                        const id = panel.id.split('-')[1];
                        if (id !== randomQuestion.id) actions.toggleSolution(id);
                    });
                    
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // Highlight and open the solution
                    card.classList.add('highlight-card');
                    setTimeout(() => card.classList.remove('highlight-card'), 2000);
                    
                    const solutionPanel = document.getElementById(`solution-${randomQuestion.id}`);
                    if (!solutionPanel.classList.contains('visible')) {
                       setTimeout(() => actions.toggleSolution(randomQuestion.id), 300);
                    }
                } else {
                    // If card is not on the current page, we need to load it
                    // Simple approach: go to page 1 and rerender, then find it
                    state.currentPage = 1;
                    render.questionGrid();
                    setTimeout(actions.pickRandom, 100); // Try again after render
                }
            },
            clearFilters: () => {
                state.searchTerm = '';
                state.topic = 'all';
                state.subtopic = 'all';
                state.difficulty = 'all';
                state.tags.clear();
                state.favoritesOnly = false;
                dom.favoritesToggle.classList.remove('active');
                
                render.filters();
                actions.filterQuestions();
            }
        };

        // --- EVENT BINDINGS ---
        const bindEvents = () => {
            dom.searchInput.addEventListener('input', utils.debounce(e => {
                state.searchTerm = e.target.value;
                actions.filterQuestions();
            }, 300));

            dom.topicFilter.addEventListener('change', e => {
                state.topic = e.target.value;
                state.subtopic = 'all'; // Reset subtopic when topic changes
                render.subtopics();
                actions.filterQuestions();
            });

            dom.subtopicFilter.addEventListener('change', e => {
                state.subtopic = e.target.value;
                actions.filterQuestions();
            });

            dom.difficultyFilter.addEventListener('change', e => {
                state.difficulty = e.target.value;
                actions.filterQuestions();
            });
            
            dom.favoritesToggle.addEventListener('click', () => {
                state.favoritesOnly = !state.favoritesOnly;
                dom.favoritesToggle.classList.toggle('active');
                actions.filterQuestions();
            });
            
            dom.clearBtn.addEventListener('click', actions.clearFilters);
            dom.randomBtn.addEventListener('click', actions.pickRandom);

            dom.themeToggle.addEventListener('click', () => {
                state.isDarkMode = !state.isDarkMode;
                document.documentElement.classList.toggle('dark-mode');
                utils.saveState();
            });
            
            dom.loadMoreBtn.addEventListener('click', () => {
                state.currentPage++;
                render.questionGrid();
            });

            // Event delegation for dynamic elements
            dom.grid.addEventListener('click', e => {
                const target = e.target;
                const cardId = target.closest('.question-card')?.dataset.id;
                
                if (!cardId) return;

                if (target.matches('.solution-toggle')) {
                    actions.toggleSolution(cardId);
                } else if (target.matches('.favorite-btn')) {
                    actions.toggleFavorite(cardId);
                } else if (target.matches('.tag')) {
                    const tag = target.dataset.tag;
                    if(state.tags.has(tag)) {
                        state.tags.delete(tag);
                    } else {
                        state.tags.add(tag);
                    }
                    actions.filterQuestions();
                }
            });
        };

        // --- INITIALIZATION ---
        const init = async () => {
            utils.loadState();
            try {
                const response = await fetch('data/questions.json');
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                allQuestions = await response.json();
                filteredQuestions = [...allQuestions];
                render.filters();
                actions.filterQuestions();
                bindEvents();
            } catch (error) {
                console.error("Failed to load questions:", error);
                dom.grid.innerHTML = `<p style="text-align:center; color:red;">Could not load questions. Please check the console for errors.</p>`;
            }
        };

        return { init };
    })();

    App.init();

});
