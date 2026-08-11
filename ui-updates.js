(() => {
  function seriesGroups() {
    const groups = new Map();
    activeBooks().filter(b => b.seriesName).forEach(book => {
      const key = normalize(book.seriesName);
      if (!groups.has(key)) groups.set(key, { name: book.seriesName, books: [] });
      groups.get(key).books.push(book);
    });
    groups.forEach(group => group.books.sort((a,b) => {
      const ap = Number.isFinite(Number(a.seriesPosition)) ? Number(a.seriesPosition) : Infinity;
      const bp = Number.isFinite(Number(b.seriesPosition)) ? Number(b.seriesPosition) : Infinity;
      return ap - bp || (a.publishYear || 9999) - (b.publishYear || 9999) || a.title.localeCompare(b.title);
    }));
    return [...groups.values()];
  }

  function randomCandidates() {
    const books = activeBooks();
    const standalone = books.filter(b => !b.seriesName);
    const firstFromEachSeries = seriesGroups().map(group => group.books[0]).filter(Boolean);
    return [...standalone, ...firstFromEachSeries];
  }

  function runSafeRandomiser() {
    const candidates = randomCandidates();
    if (!candidates.length) return toast('Add some books first');
    const book = candidates[Math.floor(Math.random() * candidates.length)];
    state.pickedBookId = book.id;
    renderPick(book);
    showSheet(els.pickSheet);
  }

  function renderSeriesPage() {
    const groups = seriesGroups();
    const count = document.getElementById('seriesCount');
    const viewCount = document.getElementById('seriesViewCount');
    const container = document.getElementById('seriesCollections');
    const empty = document.getElementById('emptySeries');
    if (count) count.textContent = groups.length;
    if (viewCount) viewCount.textContent = `${groups.length} ${groups.length === 1 ? 'series' : 'series'}`;
    if (!container) return;
    container.replaceChildren(...groups.map(group => {
      const section = document.createElement('section'); section.className = 'series-collection';
      const head = document.createElement('div'); head.className = 'series-collection-head';
      const title = document.createElement('h3'); title.textContent = group.name;
      const meta = document.createElement('span'); meta.textContent = `${group.books.length} ${group.books.length === 1 ? 'book' : 'books'}`;
      head.append(title, meta);
      const shelf = document.createElement('div'); shelf.className = 'series-collection-shelf';
      group.books.forEach((book, index) => {
        const card = makeBookCard(book);
        const badge = document.createElement('span'); badge.className = 'series-mini-number';
        badge.textContent = book.seriesPosition != null ? `#${book.seriesPosition}` : `#${index + 1}`;
        card.appendChild(badge); shelf.appendChild(card);
      });
      section.append(head, shelf); return section;
    }));
    empty?.classList.toggle('hidden', groups.length > 0);
  }

  const baseRender = render;
  render = function() { baseRender(); renderSeriesPage(); };

  // Replace the old random picker behaviour with series-safe selection everywhere.
  if (els.pickForMeButton) els.pickForMeButton.onclick = runSafeRandomiser;
  if (els.pickAgainButton) els.pickAgainButton.onclick = runSafeRandomiser;

  document.querySelectorAll('[data-summary-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.summaryAction;
    if (action === 'random') return runSafeRandomiser();
    if (action === 'series') {
      document.querySelector('[data-view="seriesView"]')?.click();
      return;
    }
    if (action === 'all') {
      state.tagFilter = null; state.query = ''; els.searchInput.value = ''; render();
    }
  }));

  // app.js wires data-view navigation before this file loads; make sure the new Series tab gets the same behaviour.
  document.querySelector('[data-view="seriesView"]')?.addEventListener('click', () => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('seriesView')?.classList.add('active');
    document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view === 'seriesView'));
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  // Add Book is an action rather than a page, so it never stays highlighted.
  document.querySelector('.nav-add')?.addEventListener('click', () => {
    document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.remove('active'));
  });

  renderSeriesPage();
})();