const STORAGE_KEY = 'kizzy-tbr-library-v1';

const demoBooks = [];

const state = {
  books: [],
  sort: 'recent',
  tagFilter: null,
  query: '',
  activeBookId: null,
  pickedBookId: null,
  latestSearchResults: []
};

const $ = (id) => document.getElementById(id);
const els = {
  waitingCount: $('waitingCount'), totalCount: $('totalCount'), highPriorityCount: $('highPriorityCount'), radarCount: $('radarCount'), somedayCount: $('somedayCount'),
  bookshelf: $('bookshelf'), archiveGrid: $('archiveGrid'), emptyShelf: $('emptyShelf'), emptyArchive: $('emptyArchive'), gotItCount: $('gotItCount'),
  searchInput: $('searchInput'), filterButton: $('filterButton'), activeFilters: $('activeFilters'), addSheet: $('addSheet'), filterSheet: $('filterSheet'),
  detailSheet: $('detailSheet'), pickSheet: $('pickSheet'), editSheet: $('editSheet'), scrim: $('scrim'), bookSearchForm: $('bookSearchForm'),
  bookTitleInput: $('bookTitleInput'), bookAuthorInput: $('bookAuthorInput'), bookSearchStatus: $('bookSearchStatus'), bookSearchResults: $('bookSearchResults'),
  tagFilterList: $('tagFilterList'), clearTagFilter: $('clearTagFilter'), bookFlip: $('bookFlip'), frontTab: $('frontTab'), backTab: $('backTab'),
  detailFrontCover: $('detailFrontCover'), detailPlaceholder: $('detailPlaceholder'), backTitle: $('backTitle'), backSummary: $('backSummary'),
  detailTagline: $('detailTagline'), detailTitle: $('detailTitle'), detailAuthor: $('detailAuthor'), detailMeta: $('detailMeta'), detailTags: $('detailTags'),
  detailSummary: $('detailSummary'), detailNotes: $('detailNotes'), gotItButton: $('gotItButton'), restoreButton: $('restoreButton'), closeDetailButton: $('closeDetailButton'),
  editBookButton: $('editBookButton'), deleteBookButton: $('deleteBookButton'), pickForMeButton: $('pickForMeButton'), pickAgainButton: $('pickAgainButton'), viewPickedButton: $('viewPickedButton'), pickResult: $('pickResult'),
  exportButton: $('exportButton'), importInput: $('importInput'), editForm: $('editForm'), editTitle: $('editTitle'), editAuthor: $('editAuthor'), editTags: $('editTags'), editNotes: $('editNotes')
};

function loadLibrary() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const books = Array.isArray(parsed) ? parsed : [];
      state.books = books.filter(book => !book?.demo);
      if (state.books.length !== books.length) saveLibrary();
    } else {
      state.books = [];
      saveLibrary();
    }
  } catch {
    state.books = [];
    saveLibrary();
  }
}

function saveLibrary() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.books)); }
function activeBooks() { return state.books.filter(b => b.status === 'tbr'); }
function archivedBooks() { return state.books.filter(b => b.status === 'got'); }
function currentBook() { return state.books.find(b => b.id === state.activeBookId) || null; }
function normalize(s = '') { return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); }
function titleCase(s = '') { return s.replace(/\b\w/g, c => c.toUpperCase()); }
function uid(prefix = 'book') { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }
function dateLabel(iso) { if (!iso) return ''; return new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(new Date(iso)); }
function yearFromDate(d) { const y = Number(String(d || '').slice(0,4)); return Number.isFinite(y) && y > 0 ? y : null; }
function uniqueTags() { return [...new Set(activeBooks().flatMap(b => b.tags || []))].sort((a,b) => a.localeCompare(b)); }

function toast(message) {
  const node = document.createElement('div'); node.className = 'toast'; node.textContent = message; document.body.appendChild(node);
  setTimeout(() => node.remove(), 2200);
}

function filteredBooks() {
  let books = activeBooks();
  const q = normalize(state.query.trim());
  if (q) books = books.filter(b => normalize(`${b.title} ${b.author}`).includes(q));
  if (state.tagFilter) books = books.filter(b => (b.tags || []).includes(state.tagFilter));
  books = [...books];
  if (state.sort === 'recent') books.sort((a,b) => new Date(b.dateAdded) - new Date(a.dateAdded));
  if (state.sort === 'oldest') books.sort((a,b) => new Date(a.dateAdded) - new Date(b.dateAdded));
  if (state.sort === 'az') books.sort((a,b) => a.title.localeCompare(b.title));
  if (state.sort === 'author') books.sort((a,b) => (a.author || '').localeCompare(b.author || ''));
  if (state.sort === 'random') books.sort(() => Math.random() - .5);
  return books;
}

function makeCoverPlaceholder(book) {
  const div = document.createElement('div'); div.className = 'cover-placeholder';
  const strong = document.createElement('strong'); strong.textContent = book.title;
  const span = document.createElement('span'); span.textContent = book.author || 'Unknown author';
  div.append(strong, span); return div;
}

function configureImage(img, placeholder, book) {
  if (!book.coverUrl) {
    img.classList.add('hidden'); placeholder.classList.remove('hidden'); placeholder.replaceChildren(...makeCoverPlaceholder(book).childNodes);
    return;
  }
  img.src = book.coverUrl; img.alt = `Cover of ${book.title}`;
  img.onerror = () => { img.classList.add('hidden'); placeholder.classList.remove('hidden'); placeholder.replaceChildren(...makeCoverPlaceholder(book).childNodes); };
  img.onload = () => { img.classList.remove('hidden'); placeholder.classList.add('hidden'); };
}

function makeBookCard(book, archived = false) {
  const node = document.querySelector('#bookCardTemplate').content.firstElementChild.cloneNode(true);
  node.dataset.id = book.id;
  node.setAttribute('aria-label', `${book.title} by ${book.author || 'Unknown author'}`);
  const img = node.querySelector('.book-cover'); const placeholder = node.querySelector('.cover-placeholder');
  configureImage(img, placeholder, book);
  node.addEventListener('click', () => openBook(book.id));
  if (archived) node.querySelector('.shelf-ledger').remove();
  return node;
}

function render() {
  const all = activeBooks(); const visible = filteredBooks(); const archive = archivedBooks().sort((a,b) => new Date(b.dateObtained) - new Date(a.dateObtained));
  els.waitingCount.textContent = `${all.length} ${all.length === 1 ? 'book' : 'books'} waiting`;
  els.totalCount.textContent = all.length;
  els.highPriorityCount.textContent = all.filter(b => b.tags?.includes('High Priority')).length;
  els.radarCount.textContent = all.filter(b => b.tags?.includes('On My Radar')).length;
  els.somedayCount.textContent = all.filter(b => b.tags?.includes('Maybe Someday')).length;
  els.bookshelf.replaceChildren(...visible.map(b => makeBookCard(b)));
  els.emptyShelf.classList.toggle('hidden', visible.length > 0);
  els.archiveGrid.replaceChildren(...archive.map(b => makeBookCard(b, true)));
  els.emptyArchive.classList.toggle('hidden', archive.length > 0);
  els.gotItCount.textContent = `${archive.length} ${archive.length === 1 ? 'book' : 'books'} obtained`;
  renderFilters();
}

function renderFilters() {
  const chips = [];
  if (state.tagFilter) { const c = document.createElement('button'); c.className = 'chip'; c.type = 'button'; c.textContent = `${state.tagFilter} ×`; c.onclick = () => { state.tagFilter = null; render(); }; chips.push(c); }
  if (state.sort !== 'recent') { const c = document.createElement('span'); c.className = 'chip'; c.textContent = `Sort: ${titleCase(state.sort)}`; chips.push(c); }
  els.activeFilters.replaceChildren(...chips);

  els.tagFilterList.replaceChildren(...uniqueTags().map(tag => {
    const b = document.createElement('button'); b.type='button'; b.textContent = tag; b.classList.toggle('selected', state.tagFilter === tag);
    b.onclick = () => { state.tagFilter = tag; closeOverlays(); render(); }; return b;
  }));
  document.querySelectorAll('#sortOptions button').forEach(b => b.classList.toggle('selected', b.dataset.sort === state.sort));
}

function showSheet(sheet) {
  closeOverlays(false);
  els.scrim.classList.remove('hidden'); sheet.classList.remove('hidden');
}
function closeOverlays(hideScrim = true) {
  [els.addSheet, els.filterSheet, els.pickSheet, els.editSheet].forEach(x => x.classList.add('hidden'));
  if (hideScrim) els.scrim.classList.add('hidden');
}

async function searchOpenLibrary(title, author) {
  const params = new URLSearchParams({ title });
  if (author.trim()) params.set('author', author.trim());
  params.set('limit','12');
  params.set('fields','key,title,author_name,first_publish_year,cover_i,isbn,publisher,edition_count');
  const response = await fetch(`https://openlibrary.org/search.json?${params}`);
  if (!response.ok) throw new Error('Search failed');
  const data = await response.json(); return data.docs || [];
}

function renderSearchResults(results) {
  els.bookSearchResults.replaceChildren(...results.map((r, idx) => {
    const btn = document.createElement('button'); btn.type='button'; btn.className='search-result';
    const coverHolder = document.createElement('div');
    const img = document.createElement('img'); img.alt='';
    const placeholder = makeCoverPlaceholder({title:r.title, author:(r.author_name || []).join(', ')});
    placeholder.classList.add('hidden'); coverHolder.append(img, placeholder);
    const coverUrl = r.cover_i ? `https://covers.openlibrary.org/b/id/${r.cover_i}-M.jpg` : null;
    if (coverUrl) { img.src = coverUrl; img.onerror = () => { img.classList.add('hidden'); placeholder.classList.remove('hidden'); }; }
    else { img.classList.add('hidden'); placeholder.classList.remove('hidden'); }
    const text = document.createElement('div');
    const h = document.createElement('h3'); h.textContent = r.title || 'Untitled';
    const p1 = document.createElement('p'); p1.textContent = (r.author_name || ['Unknown author']).join(', ');
    const p2 = document.createElement('p'); p2.textContent = [r.first_publish_year, r.publisher?.[0]].filter(Boolean).join(' · ');
    text.append(h,p1,p2); btn.append(coverHolder,text); btn.onclick = () => addSearchResult(idx); return btn;
  }));
}

async function fetchWorkDetails(key) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(`https://openlibrary.org${key}.json`, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
function parseDescription(desc) { if (!desc) return ''; return typeof desc === 'string' ? desc : (desc.value || ''); }

async function addSearchResult(index) {
  const r = state.latestSearchResults[index]; if (!r) return;
  els.bookSearchStatus.textContent = 'Adding book…';
  let work = null;
  try {
    work = r.key ? await fetchWorkDetails(r.key) : null;
  } catch {
    work = null;
  }
  const isbn = Array.isArray(r.isbn) ? r.isbn.find(x => /^97[89]/.test(x)) || r.isbn[0] : null;
  const coverUrl = r.cover_i ? `https://covers.openlibrary.org/b/id/${r.cover_i}-L.jpg` : (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` : null);
  const book = {
    id: uid(), title: r.title || els.bookTitleInput.value.trim(), author: (r.author_name || [els.bookAuthorInput.value.trim() || 'Unknown author']).join(', '),
    coverUrl, backCoverUrl: null, summary: parseDescription(work?.description), publishYear: r.first_publish_year || null,
    publisher: r.publisher?.[0] || null, openLibraryKey: r.key || null, isbn: isbn || null,
    dateAdded: new Date().toISOString(), status: 'tbr', dateObtained: null, tags: [], notes: '', demo: false
  };
  state.books.unshift(book); saveLibrary(); render(); closeOverlays(); els.bookSearchForm.reset(); els.bookSearchResults.replaceChildren(); els.bookSearchStatus.textContent='';
  toast('Added to your TBR'); openBook(book.id);
}

function openBook(id) {
  const book = state.books.find(b => b.id === id); if (!book) return;
  state.activeBookId = id; els.detailSheet.classList.remove('hidden'); els.bookFlip.classList.remove('flipped'); updateFlipTabs(false);
  configureImage(els.detailFrontCover, els.detailPlaceholder, book);
  els.backTitle.textContent = book.title; els.backSummary.textContent = book.summary || 'No summary was available from the book source.';
  els.detailTitle.textContent = book.title; els.detailAuthor.textContent = book.author || 'Unknown author';
  els.detailTagline.textContent = book.status === 'got' ? 'Got It archive' : 'On your TBR';
  els.detailMeta.replaceChildren(...[
    book.publishYear ? String(book.publishYear) : null,
    book.publisher || null,
    `Added ${dateLabel(book.dateAdded)}`,
    book.status === 'got' && book.dateObtained ? `Got ${dateLabel(book.dateObtained)}` : null
  ].filter(Boolean).map(t => { const s=document.createElement('span'); s.textContent=t; return s; }));
  els.detailTags.replaceChildren(...(book.tags || []).map(t => { const s=document.createElement('span'); s.textContent=t; return s; }));
  els.detailSummary.textContent = book.summary || 'No summary is available for this edition yet.';
  els.detailNotes.value = book.notes || '';
  els.gotItButton.classList.toggle('hidden', book.status === 'got');
  els.restoreButton.classList.toggle('hidden', book.status !== 'got');
}
function closeBook() { els.detailSheet.classList.add('hidden'); state.activeBookId = null; }
function setFlipped(flipped) { els.bookFlip.classList.toggle('flipped', flipped); updateFlipTabs(flipped); }
function updateFlipTabs(flipped) { els.frontTab.classList.toggle('selected', !flipped); els.backTab.classList.toggle('selected', flipped); }

function markGotIt() {
  const book = currentBook(); if (!book) return; book.status='got'; book.dateObtained=new Date().toISOString(); book.notes=els.detailNotes.value; saveLibrary(); closeBook(); render(); toast('Moved to Got It');
}
function restoreBook() {
  const book = currentBook(); if (!book) return; book.status='tbr'; book.dateObtained=null; book.notes=els.detailNotes.value; saveLibrary(); closeBook(); render(); toast('Restored to your TBR');
}
function deleteBook() {
  const book=currentBook(); if(!book) return; if(!confirm(`Permanently remove “${book.title}”? This cannot be undone.`)) return;
  state.books = state.books.filter(b => b.id !== book.id); saveLibrary(); closeBook(); render(); toast('Book removed');
}

function randomPick() {
  const books = activeBooks(); if (!books.length) { toast('Your TBR is empty'); return; }
  const picked = books[Math.floor(Math.random()*books.length)]; state.pickedBookId = picked.id;
  const holder = document.createElement('div'); const img = document.createElement('img'); const ph = makeCoverPlaceholder(picked); ph.classList.add('hidden'); configureImage(img, ph, picked);
  const h=document.createElement('h3'); h.textContent=picked.title; const p=document.createElement('p'); p.textContent=picked.author || 'Unknown author'; holder.append(img,ph,h,p); els.pickResult.replaceChildren(...holder.childNodes); showSheet(els.pickSheet);
}

function exportLibrary() {
  const blob = new Blob([JSON.stringify({version:1, exportedAt:new Date().toISOString(), books:state.books}, null, 2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`tbr-backup-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function importLibrary(file) {
  try {
    const data=JSON.parse(await file.text()); const books=Array.isArray(data) ? data : data.books; if(!Array.isArray(books)) throw new Error();
    if(!confirm(`Import ${books.length} books and replace the current library on this device?`)) return;
    state.books=books; saveLibrary(); render(); toast('Library imported');
  } catch { alert('That file does not look like a valid TBR backup.'); }
}

function openEdit() {
  const book=currentBook(); if(!book) return; els.editTitle.value=book.title; els.editAuthor.value=book.author || ''; els.editTags.value=(book.tags || []).join(', '); els.editNotes.value=book.notes || ''; els.detailSheet.classList.add('hidden'); showSheet(els.editSheet);
}
function saveEdit(e) {
  e.preventDefault(); const book=currentBook(); if(!book) return; book.title=els.editTitle.value.trim(); book.author=els.editAuthor.value.trim(); book.tags=els.editTags.value.split(',').map(x=>x.trim()).filter(Boolean); book.notes=els.editNotes.value.trim(); saveLibrary(); closeOverlays(); render(); openBook(book.id); toast('Book updated');
}

function wireEvents() {
  document.querySelectorAll('.add-book-trigger').forEach(b => b.addEventListener('click', () => showSheet(els.addSheet)));
  document.querySelectorAll('.close-sheet').forEach(b => b.addEventListener('click', () => closeOverlays()));
  els.scrim.addEventListener('click', () => closeOverlays());
  els.filterButton.addEventListener('click', () => showSheet(els.filterSheet));
  els.searchInput.addEventListener('input', e => { state.query=e.target.value; render(); });
  els.clearTagFilter.addEventListener('click', () => { state.tagFilter=null; closeOverlays(); render(); });
  document.querySelectorAll('#sortOptions button').forEach(b => b.addEventListener('click', () => { state.sort=b.dataset.sort; closeOverlays(); render(); }));
  document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    $(b.dataset.view).classList.add('active'); b.classList.add('active');
  }));
  els.bookSearchForm.addEventListener('submit', async e => {
    e.preventDefault(); const title=els.bookTitleInput.value.trim(); const author=els.bookAuthorInput.value.trim(); if(!title) return;
    els.bookSearchStatus.textContent='Searching Open Library…'; els.bookSearchResults.replaceChildren();
    try { const results=await searchOpenLibrary(title, author); state.latestSearchResults=results; els.bookSearchStatus.textContent=results.length ? `Choose the right edition (${results.length} found)` : 'No matches found. Try fewer words or omit the author.'; renderSearchResults(results); }
    catch { els.bookSearchStatus.textContent='Search failed. Check your connection and try again.'; }
  });
  els.closeDetailButton.addEventListener('click', closeBook);
  els.bookFlip.addEventListener('click', () => setFlipped(!els.bookFlip.classList.contains('flipped')));
  els.bookFlip.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); setFlipped(!els.bookFlip.classList.contains('flipped')); }});
  els.frontTab.addEventListener('click', () => setFlipped(false)); els.backTab.addEventListener('click', () => setFlipped(true));
  els.gotItButton.addEventListener('click', markGotIt); els.restoreButton.addEventListener('click', restoreBook); els.deleteBookButton.addEventListener('click', deleteBook); els.editBookButton.addEventListener('click', openEdit);
  els.detailNotes.addEventListener('change', () => { const b=currentBook(); if(b){b.notes=els.detailNotes.value; saveLibrary();} });
  els.pickForMeButton.addEventListener('click', randomPick); els.pickAgainButton.addEventListener('click', randomPick); els.viewPickedButton.addEventListener('click', () => { const id=state.pickedBookId; closeOverlays(); if(id) openBook(id); });
  els.exportButton.addEventListener('click', exportLibrary); els.importInput.addEventListener('change', e => { if(e.target.files?.[0]) importLibrary(e.target.files[0]); e.target.value=''; });
  els.editForm.addEventListener('submit', saveEdit);
}

function registerServiceWorker() { if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{}); }

loadLibrary(); wireEvents(); render(); registerServiceWorker();
