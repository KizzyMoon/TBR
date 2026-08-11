/* Series support for My TBR Shelf.
   Uses Open Library metadata on a best-effort basis. */

(() => {
  const originalAddSearchResult = addSearchResult;
  const originalRender = render;
  const originalCloseOverlays = closeOverlays;
  let pendingSeries = null;

  const seriesEls = {
    sheet: document.getElementById('seriesSheet'),
    title: document.getElementById('seriesSheetTitle'),
    message: document.getElementById('seriesMessage'),
    preview: document.getElementById('seriesPreview'),
    addAll: document.getElementById('addSeriesButton'),
    justOne: document.getElementById('justOneButton')
  };

  const style = document.createElement('style');
  style.textContent = `
    .series-divider {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 14px 2px -2px;
      padding: 0 2px;
      color: var(--cream, #ead9c3);
    }
    .series-divider strong { font-family: Georgia, 'Times New Roman', serif; font-size: .98rem; font-weight: 600; }
    .series-divider span { color: var(--muted, #a99791); font-size: .75rem; white-space: nowrap; }
    .series-book-number {
      position: absolute;
      top: 6px;
      left: 6px;
      z-index: 2;
      min-width: 25px;
      height: 25px;
      padding: 0 7px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      font-size: .7rem;
      font-weight: 700;
      color: #171014;
      background: rgba(234, 217, 195, .92);
      box-shadow: 0 4px 12px rgba(0,0,0,.3);
      pointer-events: none;
    }
    .book-card { position: relative; }
    .series-preview {
      display: grid;
      grid-template-columns: repeat(4, minmax(0,1fr));
      gap: 9px;
      margin: 18px 0;
    }
    .series-preview-item { min-width: 0; }
    .series-preview-item img,
    .series-preview-placeholder {
      width: 100%;
      aspect-ratio: 2 / 3;
      border-radius: 7px;
      object-fit: cover;
      box-shadow: 0 8px 18px rgba(0,0,0,.34);
      background: #24191c;
    }
    .series-preview-placeholder {
      padding: 7px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: #d7c3b4;
      font-size: .62rem;
      line-height: 1.2;
    }
    .series-preview-item p {
      margin: 6px 1px 0;
      color: #c7b3a9;
      font-size: .66rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .series-question-copy { margin-top: 8px; line-height: 1.5; }
    @media (prefers-reduced-motion: no-preference) {
      .series-preview-item { animation: seriesPop .22s ease both; }
      @keyframes seriesPop { from { opacity: 0; transform: translateY(8px); } }
    }
  `;
  document.head.appendChild(style);

  function cleanSeriesName(value = '') {
    return String(value)
      .replace(/\s*[,:-]?\s*(?:book|volume|vol\.?|#)\s*\d+(?:\.\d+)?\s*$/i, '')
      .replace(/\s*[,:-]?\s*\(?\d+(?:\.\d+)?\)?\s*$/i, '')
      .trim();
  }

  function seriesNumber(values = [], title = '') {
    const list = Array.isArray(values) ? values : [values];
    for (const raw of list) {
      const s = String(raw || '');
      const patterns = [
        /(?:book|volume|vol\.?|#)\s*(\d+(?:\.\d+)?)/i,
        /[,;:]\s*(\d+(?:\.\d+)?)\s*$/,
        /\((\d+(?:\.\d+)?)\)\s*$/
      ];
      for (const pattern of patterns) {
        const m = s.match(pattern);
        if (m) return Number(m[1]);
      }
    }
    const titleMatch = String(title).match(/\b(?:book|volume|vol\.?|#)\s*(\d+(?:\.\d+)?)/i);
    return titleMatch ? Number(titleMatch[1]) : null;
  }

  function sameBook(a, b) {
    if (a.openLibraryKey && b.key && a.openLibraryKey.replace(/^\/works\//,'') === String(b.key).replace(/^\/works\//,'')) return true;
    return normalize(a.title) === normalize(b.title) && normalize(a.author) === normalize((b.author_name || []).join(', '));
  }

  function getSeriesFromDoc(doc) {
    const values = Array.isArray(doc?.series) ? doc.series : (doc?.series ? [doc.series] : []);
    if (!values.length) return null;
    const cleaned = values.map(cleanSeriesName).filter(Boolean).sort((a,b) => a.length - b.length);
    return cleaned[0] || null;
  }

  async function fetchEditionSeries(workKey) {
    if (!workKey) return null;
    const key = String(workKey).startsWith('/works/') ? workKey : `/works/${String(workKey).replace(/^\//,'')}`;
    try {
      const res = await fetch(`https://openlibrary.org${key}/editions.json?limit=20`);
      if (!res.ok) return null;
      const data = await res.json();
      const candidates = [];
      for (const edition of data.entries || []) {
        const vals = Array.isArray(edition.series) ? edition.series : (edition.series ? [edition.series] : []);
        for (const val of vals) {
          const cleaned = cleanSeriesName(val);
          if (cleaned) candidates.push({ name: cleaned, raw: val });
        }
      }
      if (!candidates.length) return null;
      const counts = new Map();
      candidates.forEach(c => counts.set(c.name, (counts.get(c.name) || 0) + 1));
      candidates.sort((a,b) => (counts.get(b.name) - counts.get(a.name)) || a.name.length - b.name.length);
      return candidates[0].name;
    } catch { return null; }
  }

  async function detectSeries(selected) {
    const author = (selected.author_name || []).join(', ');
    let seriesName = getSeriesFromDoc(selected);

    try {
      const params = new URLSearchParams({
        title: selected.title || '',
        author,
        limit: '5',
        fields: 'key,title,author_name,first_publish_year,cover_i,isbn,publisher,series'
      });
      const res = await fetch(`https://openlibrary.org/search.json?${params}`);
      if (res.ok) {
        const data = await res.json();
        const exact = (data.docs || []).find(d => String(d.key).replace(/^\/works\//,'') === String(selected.key).replace(/^\/works\//,'')) || data.docs?.[0];
        seriesName = seriesName || getSeriesFromDoc(exact);
      }
    } catch {}

    seriesName = seriesName || await fetchEditionSeries(selected.key);
    if (!seriesName) return null;

    const q = `series:"${seriesName.replace(/"/g,'')}"${author ? ` author:"${author.replace(/"/g,'')}"` : ''}`;
    const params = new URLSearchParams({
      q,
      limit: '50',
      fields: 'key,title,author_name,first_publish_year,cover_i,isbn,publisher,series'
    });

    try {
      const res = await fetch(`https://openlibrary.org/search.json?${params}`);
      if (!res.ok) return null;
      const data = await res.json();
      let books = (data.docs || []).filter(d => d.title && d.key);

      const seen = new Set();
      books = books.filter(d => {
        const k = String(d.key);
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });

      books.forEach(d => {
        d._seriesName = seriesName;
        d._seriesPosition = seriesNumber(d.series, d.title);
      });

      books.sort((a,b) => {
        const ap = a._seriesPosition, bp = b._seriesPosition;
        if (ap != null && bp != null) return ap - bp;
        if (ap != null) return -1;
        if (bp != null) return 1;
        return (a.first_publish_year || 9999) - (b.first_publish_year || 9999) || a.title.localeCompare(b.title);
      });

      const hasSelected = books.some(d => String(d.key).replace(/^\/works\//,'') === String(selected.key).replace(/^\/works\//,''));
      if (!hasSelected) {
        selected._seriesName = seriesName;
        selected._seriesPosition = seriesNumber(selected.series, selected.title);
        books.push(selected);
        books.sort((a,b) => (a._seriesPosition ?? 9999) - (b._seriesPosition ?? 9999) || (a.first_publish_year || 9999) - (b.first_publish_year || 9999));
      }

      if (books.length < 2) return null;
      return { name: seriesName, books };
    } catch { return null; }
  }

  async function buildBookFromDoc(r, seriesName = null) {
    const work = r.key ? await fetchWorkDetails(String(r.key).startsWith('/works/') ? r.key : `/works/${String(r.key).replace(/^\//,'')}`) : null;
    const isbn = Array.isArray(r.isbn) ? r.isbn.find(x => /^97[89]/.test(x)) || r.isbn[0] : null;
    const coverUrl = r.cover_i ? `https://covers.openlibrary.org/b/id/${r.cover_i}-L.jpg` : (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` : null);
    return {
      id: uid(),
      title: r.title || 'Untitled',
      author: (r.author_name || ['Unknown author']).join(', '),
      coverUrl,
      backCoverUrl: null,
      summary: parseDescription(work?.description),
      publishYear: r.first_publish_year || null,
      publisher: r.publisher?.[0] || null,
      openLibraryKey: r.key || null,
      isbn: isbn || null,
      dateAdded: new Date().toISOString(),
      status: 'tbr',
      dateObtained: null,
      tags: [],
      notes: '',
      seriesName: seriesName || r._seriesName || null,
      seriesPosition: r._seriesPosition ?? seriesNumber(r.series, r.title)
    };
  }

  function showSeriesPrompt(series, selected) {
    const available = series.books.filter(b => !state.books.some(existing => sameBook(existing, b)));
    if (!available.length) return;

    pendingSeries = { ...series, books: available };
    seriesEls.title.textContent = series.name;
    const otherCount = available.filter(b => String(b.key).replace(/^\/works\//,'') !== String(selected.key).replace(/^\/works\//,'')).length;
    seriesEls.message.textContent = otherCount === 1
      ? `This book looks like part of the ${series.name} series. I found 1 other book — add it too?`
      : `This book looks like part of the ${series.name} series. I found ${otherCount} other books — add the whole series?`;

    seriesEls.preview.replaceChildren(...series.books.slice(0,8).map(book => {
      const item = document.createElement('div'); item.className = 'series-preview-item';
      if (book.cover_i) {
        const img = document.createElement('img'); img.loading = 'lazy'; img.alt = book.title; img.src = `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`;
        img.onerror = () => img.replaceWith(Object.assign(document.createElement('div'), { className: 'series-preview-placeholder', textContent: book.title }));
        item.appendChild(img);
      } else {
        const ph = document.createElement('div'); ph.className = 'series-preview-placeholder'; ph.textContent = book.title; item.appendChild(ph);
      }
      const p = document.createElement('p'); p.textContent = book._seriesPosition != null ? `#${book._seriesPosition} ${book.title}` : book.title;
      item.appendChild(p); return item;
    }));

    closeOverlays(false);
    els.scrim.classList.remove('hidden');
    seriesEls.sheet.classList.remove('hidden');
  }

  async function addWholeSeries() {
    if (!pendingSeries) return;
    seriesEls.addAll.disabled = true;
    seriesEls.addAll.textContent = 'Adding series…';
    const toAdd = pendingSeries.books.filter(doc => !state.books.some(existing => sameBook(existing, doc)));
    let added = 0;

    for (const doc of toAdd) {
      try {
        const book = await buildBookFromDoc(doc, pendingSeries.name);
        state.books.push(book);
        added++;
      } catch {}
    }

    // Make sure the book that triggered the prompt also carries series metadata.
    const selectedExisting = state.books.find(b => b.id === state.activeBookId) || state.books.find(b => normalize(b.title) === normalize(state.latestSearchResults?.[0]?.title || ''));
    if (selectedExisting && !selectedExisting.seriesName) selectedExisting.seriesName = pendingSeries.name;

    saveLibrary();
    render();
    pendingSeries = null;
    seriesEls.addAll.disabled = false;
    seriesEls.addAll.textContent = 'Add whole series';
    seriesEls.sheet.classList.add('hidden');
    els.scrim.classList.add('hidden');
    toast(added ? `Added ${added} ${added === 1 ? 'book' : 'books'} from the series` : 'Series already on your shelf');
  }

  // Wrap the existing add flow. The selected book is still added immediately,
  // then series metadata is checked and the user is offered the rest.
  addSearchResult = async function(index) {
    const selected = state.latestSearchResults[index];
    if (!selected) return originalAddSearchResult(index);

    await originalAddSearchResult(index);
    const justAdded = state.books.find(b => b.id === state.activeBookId);

    try {
      const series = await detectSeries(selected);
      if (!series) return;
      if (justAdded) {
        justAdded.seriesName = series.name;
        const selectedDoc = series.books.find(d => String(d.key).replace(/^\/works\//,'') === String(selected.key).replace(/^\/works\//,''));
        justAdded.seriesPosition = selectedDoc?._seriesPosition ?? seriesNumber(selectedDoc?.series, selected.title);
        saveLibrary();
        render();
      }
      const remaining = series.books.filter(d => !state.books.some(existing => sameBook(existing, d)));
      if (remaining.length) showSeriesPrompt(series, selected);
    } catch {
      // Series lookup is optional; never block normal book adding.
    }
  };

  function groupedVisibleBooks() {
    const source = filteredBooks();
    const seriesGroups = new Map();
    source.forEach(book => {
      if (!book.seriesName) return;
      const key = normalize(book.seriesName);
      if (!seriesGroups.has(key)) seriesGroups.set(key, []);
      seriesGroups.get(key).push(book);
    });
    seriesGroups.forEach(group => group.sort((a,b) => {
      const ap = a.seriesPosition, bp = b.seriesPosition;
      if (ap != null && bp != null) return ap - bp;
      if (ap != null) return -1;
      if (bp != null) return 1;
      return (a.publishYear || 9999) - (b.publishYear || 9999) || a.title.localeCompare(b.title);
    }));

    const renderedSeries = new Set();
    const output = [];
    for (const book of source) {
      if (!book.seriesName) { output.push({ type:'book', book }); continue; }
      const key = normalize(book.seriesName);
      if (renderedSeries.has(key)) continue;
      renderedSeries.add(key);
      const group = seriesGroups.get(key) || [book];
      output.push({ type:'series', name: book.seriesName, books: group });
    }
    return output;
  }

  render = function() {
    originalRender();
    const layout = groupedVisibleBooks();
    const nodes = [];
    for (const item of layout) {
      if (item.type === 'book') {
        nodes.push(makeBookCard(item.book));
      } else {
        const heading = document.createElement('div'); heading.className = 'series-divider';
        const strong = document.createElement('strong'); strong.textContent = item.name;
        const count = document.createElement('span'); count.textContent = `${item.books.length} ${item.books.length === 1 ? 'book' : 'books'}`;
        heading.append(strong, count); nodes.push(heading);
        for (const book of item.books) {
          const card = makeBookCard(book);
          if (book.seriesPosition != null) {
            const badge = document.createElement('span'); badge.className = 'series-book-number'; badge.textContent = `#${book.seriesPosition}`;
            card.appendChild(badge);
          }
          nodes.push(card);
        }
      }
    }
    els.bookshelf.replaceChildren(...nodes);
  };

  closeOverlays = function(hideScrim = true) {
    originalCloseOverlays(hideScrim);
    seriesEls.sheet?.classList.add('hidden');
  };

  seriesEls.addAll?.addEventListener('click', addWholeSeries);
  seriesEls.justOne?.addEventListener('click', () => {
    pendingSeries = null;
    seriesEls.sheet.classList.add('hidden');
    els.scrim.classList.add('hidden');
    toast('Just this book added');
  });
  seriesEls.sheet?.querySelector('.close-series-sheet')?.addEventListener('click', () => {
    pendingSeries = null;
    seriesEls.sheet.classList.add('hidden');
    els.scrim.classList.add('hidden');
  });

  // Re-render once so existing imported series metadata is grouped too.
  render();
})();
