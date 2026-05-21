import { t } from './translations.js';
import { parseSongs, validate, escapeHtml, randomSample } from './utils.js';

// ── Build one bingo card ───────────────────────────────────────
function buildCard(songs, columns, rows, cardNumber, cardTitle) {
  const sample = randomSample(songs, columns * rows);
  const grid   = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: columns }, (_, c) => sample[c * rows + r])
  );
  const card  = document.createElement('div');
  card.className = 'bingo-card';
  const title = document.createElement('div');
  title.className = 'bingo-card-title';
  title.textContent = cardTitle;
  card.appendChild(title);
  const table = document.createElement('table');
  grid.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach(cell => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  card.appendChild(table);
  const num = document.createElement('div');
  num.className = 'card-number';
  num.textContent = `#${cardNumber}`;
  card.appendChild(num);
  return card;
}

export function initGenerator() {
  const songsInput     = document.getElementById('songs-input');
  const errorList      = document.getElementById('error-list');
  const errorItems     = document.getElementById('error-items');
  const btnGenerate    = document.getElementById('btn-generate');
  const btnPrint       = document.getElementById('btn-print');
  const results        = document.getElementById('results');
  const resultsMeta    = document.getElementById('results-meta');
  const cardsContainer = document.getElementById('cards-container');
  const inpTitle       = document.getElementById('inp-title');
  const inpColumns     = document.getElementById('inp-columns');
  const inpRows        = document.getElementById('inp-rows');
  const inpCards       = document.getElementById('inp-cards');

  // ── Generate cards ─────────────────────────────────────────────
  btnGenerate.addEventListener('click', () => {
    const songs    = parseSongs(songsInput.value);
    const errors   = validate(songs);
    const columns  = parseInt(inpColumns.value, 10) || 3;
    const rows     = parseInt(inpRows.value,    10) || 2;
    const numCards = parseInt(inpCards.value,   10) || 10;
    const needed   = columns * rows;

    if (errors.length > 0) {
      errorItems.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
      errorList.style.display = 'block';
      songsInput.classList.add('error');
      songsInput.focus();
      return;
    }
    errorList.style.display = 'none';
    songsInput.classList.remove('error');

    if (songs.length < needed) {
      errorItems.innerHTML = `<li>${t('errors.tooFew', needed, columns, rows, songs.length)}</li>`;
      errorList.style.display = 'block';
      songsInput.classList.add('error');
      return;
    }

    const cardTitle = inpTitle.value.trim() || t('card.title');
    cardsContainer.innerHTML = '';
    for (let i = 1; i <= numCards; i++) {
      cardsContainer.appendChild(buildCard(songs, columns, rows, i, cardTitle));
    }
    resultsMeta.textContent = t('results.meta', numCards, columns, rows, songs.length);
    results.style.display   = 'block';
    btnPrint.style.display  = 'inline-block';
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  btnPrint.addEventListener('click', () => window.print());
}
