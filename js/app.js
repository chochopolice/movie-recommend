// ============================================================
// 設定
// ============================================================
const TMDB_API_KEY = '4372dc772fd7350658f8aee44beca640';
const TMDB_BASE    = 'https://api.themoviedb.org/3';
const TMDB_IMG     = 'https://image.tmdb.org/t/p/w500';
const LANG         = 'ja-JP';
const REGION       = 'JP';

const MAX_ROUNDS   = 5;
const GRID_SIZE    = 9;
const TARGET_POOL  = 300; // 目標取得本数

// JP向けストリーミングプロバイダーID
// 8=Amazon Prime, 9=Apple TV, 337=Disney+, 213=Netflix(JP), 283=Crunchyroll
const PROVIDER_IDS = '8|337|213|283';

// discover APIのクエリ条件
const DISCOVER_PARAMS = new URLSearchParams({
  api_key:                  TMDB_API_KEY,
  language:                 LANG,
  region:                   REGION,
  sort_by:                  'popularity.desc',
  'vote_average.gte':       '6.5',
  'vote_count.gte':         '500',
  with_watch_providers:     PROVIDER_IDS,
  watch_region:             REGION,
});

// ジャンルIDの日本語マッピング
const GENRE_MAP = {
  28:'アクション', 12:'アドベンチャー', 16:'アニメ', 35:'コメディ',
  80:'犯罪', 99:'ドキュメンタリー', 18:'ドラマ', 10751:'ファミリー',
  14:'ファンタジー', 36:'歴史', 27:'ホラー', 10402:'音楽',
  9648:'ミステリー', 10749:'ロマンス', 878:'SF', 10770:'TVムービー',
  53:'スリラー', 10752:'戦争', 37:'西部劇',
};

// ============================================================
// State
// ============================================================
let allMovies     = [];   // 軽量サマリー（一覧表示用）
let detailCache   = {};   // tmdbId → 詳細データのキャッシュ
let round         = 0;
let selections    = [];
let currentMovies = [];

// ============================================================
// 起動時：映画プールを動的取得
// ============================================================
async function loadMovies() {
  showLoading('映画リストを取得中...');

  try {
    // 総ページ数を確認
    const firstRes  = await fetch(`${TMDB_BASE}/discover/movie?${DISCOVER_PARAMS}&page=1`);
    if (!firstRes.ok) throw new Error('TMDb API エラー: ' + firstRes.status);
    const firstData = await firstRes.json();

    const totalPages  = Math.min(firstData.total_pages, 500); // TMDb上限500p
    const targetPages = Math.min(Math.ceil(TARGET_POOL / 20), totalPages);

    // ランダムにページを選んで並列取得（レート制限対策で最大15並列）
    const pages   = shuffleArray([...Array(totalPages).keys()].map(i => i + 1))
                      .slice(0, targetPages);
    const batches = chunkArray(pages, 15);

    let rawMovies = [...firstData.results];

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(p => fetch(`${TMDB_BASE}/discover/movie?${DISCOVER_PARAMS}&page=${p}`)
          .then(r => r.ok ? r.json() : null))
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.results) {
          rawMovies.push(...r.value.results);
        }
      }
      if (rawMovies.length >= TARGET_POOL) break;
    }

    // 重複除去・ポスターありのみ
    const seen = new Set();
    allMovies = rawMovies
      .filter(m => {
        if (seen.has(m.id) || !m.poster_path) return false;
        seen.add(m.id);
        return true;
      })
      .map(m => ({
        id:       String(m.id),
        tmdbId:   m.id,
        title:    m.title,
        year:     m.release_date ? parseInt(m.release_date.substring(0, 4)) : '?',
        genre:    (m.genre_ids || []).map(g => GENRE_MAP[g]).filter(Boolean),
        rating:   Math.round(m.vote_average * 10) / 10,
        iconUrl:  `${TMDB_IMG}${m.poster_path}`,
        icon:     '🎬',
      }));

    updateLoading(`${allMovies.length}本の映画を取得しました！`);
    await sleep(600);

  } catch (e) {
    console.error(e);
    alert('映画データの取得に失敗しました。\n' + e.message);
    hideLoading();
    return;
  }

  hideLoading();

  if (allMovies.length === 0) {
    alert('条件に合う映画が見つかりませんでした。');
    return;
  }

  renderProgress();
  renderGrid();
}

// ============================================================
// 映画詳細（モーダル表示時に個別取得・キャッシュ）
// ============================================================
async function fetchDetail(tmdbId) {
  if (detailCache[tmdbId]) return detailCache[tmdbId];

  try {
    const [detailRes, creditRes] = await Promise.all([
      fetch(`${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=${LANG}`),
      fetch(`${TMDB_BASE}/movie/${tmdbId}/credits?api_key=${TMDB_API_KEY}&language=${LANG}`),
    ]);
    if (!detailRes.ok) return null;

    const d = await detailRes.json();
    const c = creditRes.ok ? await creditRes.json() : { cast: [], crew: [] };

    const detail = {
      synopsis: d.overview || 'あらすじ情報なし',
      director: (c.crew || []).find(p => p.job === 'Director')?.name || '不明',
      cast:     (c.cast || []).slice(0, 4).map(a => a.name),
      genres:   (d.genres || []).map(g => GENRE_MAP[g.id] || g.name),
    };

    detailCache[tmdbId] = detail;
    return detail;
  } catch {
    return null;
  }
}

// ============================================================
// UI描画
// ============================================================
function renderProgress() {
  const bar = document.getElementById('progress-bar');
  bar.innerHTML = '';
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const dot = document.createElement('div');
    dot.className = 'progress-dot' +
      (i < round ? ' done' : i === round ? ' active' : '');
    bar.appendChild(dot);
  }
  document.getElementById('round-label').textContent =
    `ラウンド ${round + 1} / ${MAX_ROUNDS}：好きな映画を1つ選んでください`;
}

function renderGrid() {
  const excludeIds = selections.map(m => m.id);
  const pool = allMovies.filter(m => !excludeIds.includes(m.id));
  currentMovies = shuffleArray(pool).slice(0, GRID_SIZE);

  const grid = document.getElementById('movie-grid');
  grid.innerHTML = '';

  currentMovies.forEach(movie => {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.innerHTML = `
      <div class="poster-wrap">
        <img src="${movie.iconUrl}" alt="${movie.title}" loading="lazy"
             onerror="this.parentElement.innerHTML='<div class=\\'poster-placeholder\\'>🎬</div>'">
      </div>
      <div class="movie-info">
        <div class="movie-title">${movie.title}</div>
        <div class="movie-year">${movie.year}</div>
        <span class="movie-genre-tag">${movie.genre[0] || 'その他'}</span>
      </div>`;
    card.addEventListener('click', () => openModal(movie, card));
    grid.appendChild(card);
  });
}

// ============================================================
// Modal
// ============================================================
let modalMovie = null;
let modalCard  = null;

async function openModal(movie, card) {
  modalMovie = movie;
  modalCard  = card;

  // まずポスターだけ即表示
  const iconEl = document.getElementById('modal-icon');
  iconEl.className  = 'modal-poster-wrap';
  iconEl.innerHTML  = `<img src="${movie.iconUrl}" alt="${movie.title}">`;

  document.getElementById('modal-title').textContent = movie.title;
  document.getElementById('modal-meta').textContent  =
    `${movie.year} ／ ${movie.genre.join(' / ')}`;
  const stars = Math.round(movie.rating / 2);
  document.getElementById('modal-stars').textContent =
    '★'.repeat(stars) + '☆'.repeat(5 - stars) + `  ${movie.rating} / 10`;
  document.getElementById('modal-synopsis').textContent = '読み込み中...';
  document.getElementById('modal-cast').textContent     = '読み込み中...';
  document.getElementById('modal-review').textContent   = `TMDb スコア：${movie.rating} / 10`;

  document.getElementById('modal-select-btn').onclick = () => selectMovie();
  document.getElementById('modal-overlay').classList.add('open');

  // 詳細を非同期で補完
  const detail = await fetchDetail(movie.tmdbId);
  if (detail && document.getElementById('modal-overlay').classList.contains('open')) {
    document.getElementById('modal-meta').textContent =
      `${movie.year} ／ ${detail.genres.join(' / ')} ／ 監督：${detail.director}`;
    document.getElementById('modal-synopsis').textContent = detail.synopsis;
    document.getElementById('modal-cast').textContent     = detail.cast.join('、') || '情報なし';
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  modalMovie = null;
  modalCard  = null;
}

// ============================================================
// Selection & Flow
// ============================================================
function selectMovie() {
  const movie = modalMovie;
  const card  = modalCard;
  closeModal();
  if (card) card.classList.add('selected');
  selections.push(movie);
  round++;

  if (round >= MAX_ROUNDS) {
    setTimeout(showResults, 600);
  } else {
    setTimeout(() => { renderProgress(); renderGrid(); }, 400);
  }
}

// ============================================================
// AI Recommendation（Claude API）
// ============================================================
async function showResults() {
  showLoading('あなたの好みを分析中...');

  const summary = selections.map((m, i) =>
    `${i+1}. 「${m.title}」(${m.year}, ${m.genre.join('/')})`
  ).join('\n');

  const prompt = `あなたは映画の専門家です。ユーザーが以下の5本の映画を選びました：
${summary}

これらの選択からユーザーの好みを分析し、おすすめ映画を4本提案してください（選んだ映画と重複不可）。

必ず以下のJSON形式のみで返答してください（マークダウン・説明文不要）:
{
  "analysis": "ユーザーの好み分析（2文程度）",
  "recommendations": [
    {
      "title": "映画タイトル（日本語）",
      "year": 公開年,
      "genre": "ジャンル",
      "icon": "絵文字1文字",
      "tmdb_id": TMDbの映画ID（数字、必ず入れること）,
      "reason": "このユーザーにおすすめする理由（2文程度）"
    }
  ]
}`;

  try {
    // Netlify Function 経由で Anthropic API を呼び出す（CORS回避）
    const res = await fetch('/.netlify/functions/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data   = await res.json();
    const text   = data.content.map(b => b.text || '').join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    // TMDb IDからポスター画像を補完
    const recs = await Promise.all(parsed.recommendations.map(async rec => {
      if (rec.tmdb_id) {
        try {
          const r = await fetch(
            `${TMDB_BASE}/movie/${rec.tmdb_id}?api_key=${TMDB_API_KEY}&language=${LANG}`
          );
          if (r.ok) {
            const d = await r.json();
            if (d.poster_path) rec.iconUrl = `${TMDB_IMG}${d.poster_path}`;
          }
        } catch { /* ポスターなしでフォールバック */ }
      }
      return rec;
    }));

    hideLoading();
    document.getElementById('selection-screen').style.display = 'none';
    document.getElementById('result-screen').style.display    = 'block';
    document.getElementById('result-subtitle').textContent    = parsed.analysis;

    const rGrid = document.getElementById('result-grid');
    rGrid.innerHTML = '';
    recs.forEach(rec => {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.innerHTML = `
        <div class="result-card-img">
          ${rec.iconUrl
            ? `<img src="${rec.iconUrl}" alt="${rec.title}"
                style="width:100%;height:100%;object-fit:cover;"
                onerror="this.parentElement.textContent='${rec.icon || '🎬'}'">`
            : (rec.icon || '🎬')}
        </div>
        <div class="result-card-body">
          <div class="result-card-title">${rec.title} (${rec.year})</div>
          <span class="movie-genre-tag">${rec.genre}</span>
          <div class="result-card-why">${rec.reason}</div>
        </div>`;
      rGrid.appendChild(card);
    });

  } catch (e) {
    console.error(e);
    updateLoading('エラーが発生しました。再度お試しください。');
    setTimeout(() => { hideLoading(); restart(); }, 2000);
  }
}

// ============================================================
// Restart
// ============================================================
function restart() {
  round = 0;
  selections = [];
  document.getElementById('result-screen').style.display    = 'none';
  document.getElementById('selection-screen').style.display = 'block';
  renderProgress();
  renderGrid();
}

// ============================================================
// Utils
// ============================================================
function showLoading(msg) {
  document.getElementById('loading-text').textContent = msg;
  document.getElementById('loading-overlay').classList.remove('hidden');
}
function updateLoading(msg) {
  document.getElementById('loading-text').textContent = msg;
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}
function shuffleArray(arr) {
  return arr.sort(() => Math.random() - 0.5);
}
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
// Init
// ============================================================
loadMovies();
