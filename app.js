/* Uncover V7 — Discover renderer fix
   Keeps discovery anonymous and uses the secure discover_people RPC.
*/
(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
    }[ch]));
  }

  function arrayValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [value];
      } catch (_) {
        return value ? [value] : [];
      }
    }
    return [];
  }

  function card(person) {
    const interests = arrayValue(person.interests);
    const looking = arrayValue(person.looking_for);

    const interestHtml = interests.length
      ? interests.map(x => `<span class="tag">${escapeHtml(x)}</span>`).join('')
      : '<span class="muted">No interests added yet</span>';

    const lookingHtml = looking.length
      ? looking.map(x => escapeHtml(x)).join(' · ')
      : 'Open to conversation';

    const location = person.location ? escapeHtml(person.location) : 'Somewhere nearby';
    const bio = person.bio ? escapeHtml(person.bio) : 'Open to a thoughtful conversation.';
    const age = Number.isFinite(Number(person.age)) ? escapeHtml(person.age) : '18+';

    return `
      <article class="discover-card" data-user-id="${escapeHtml(person.user_id)}">
        <div class="discover-avatar" aria-hidden="true">?</div>
        <div class="discover-content">
          <div class="discover-top">
            <div>
              <p class="eyebrow">ANONYMOUS</p>
              <h2>Someone</h2>
              <p class="muted">${age} · ${location}</p>
            </div>
            <span class="status-dot" title="Discoverable"></span>
          </div>
          <p class="discover-bio">${bio}</p>
          <div class="tags">${interestHtml}</div>
          <p class="discover-looking"><strong>Looking for:</strong> ${lookingHtml}</p>
          <div class="discover-actions">
            <button class="btn outline pass-btn" type="button" data-action="pass">Pass</button>
            <button class="btn dark chat-btn" type="button" data-action="chat">Start private chat →</button>
          </div>
        </div>
      </article>`;
  }

  async function loadDiscover() {
    const list = $('#discoverList');
    const empty = $('#discoverEmpty');
    if (!list) return;

    list.innerHTML = `
      <div class="loading-card">
        <strong>Finding people to uncover…</strong>
        <span class="muted">Only anonymous-safe information is shown.</span>
      </div>`;
    if (empty) empty.hidden = true;

    try {
      const auth = window.UncoverAuth;
      if (!auth || !auth.getClient) throw new Error('Uncover authentication is not available.');

      const user = await auth.getUser();
      if (!user) {
        window.location.href = 'login.html';
        return;
      }

      const sb = auth.getClient();
      const { data, error } = await sb.rpc('discover_people', { p_limit: 12 });

      if (error) throw error;

      const people = Array.isArray(data) ? data : [];

      if (!people.length) {
        list.innerHTML = '';
        if (empty) {
          empty.hidden = false;
          empty.textContent = 'No new anonymous conversations right now. Check back soon.';
        }
        return;
      }

      list.innerHTML = people.map(card).join('');
      bindCards(sb);
    } catch (err) {
      console.error('Uncover Discover error:', err);
      list.innerHTML = `
        <div class="loading-card">
          <strong>We couldn't load Discover.</strong>
          <span class="muted">${escapeHtml(err?.message || 'Please refresh and try again.')}</span>
          <button class="btn dark" type="button" id="retryDiscover">Try again</button>
        </div>`;
      const retry = $('#retryDiscover');
      if (retry) retry.addEventListener('click', loadDiscover);
    }
  }

  function bindCards(sb) {
    document.querySelectorAll('.discover-card').forEach(cardEl => {
      const userId = cardEl.dataset.userId;
      const pass = $('[data-action="pass"]', cardEl);
      const chat = $('[data-action="chat"]', cardEl);

      if (pass) {
        pass.addEventListener('click', () => {
          cardEl.remove();
          const remaining = document.querySelectorAll('.discover-card').length;
          if (!remaining) {
            const empty = $('#discoverEmpty');
            if (empty) {
              empty.hidden = false;
              empty.textContent = 'No more anonymous conversations right now. Check back soon.';
            }
          }
        });
      }

      if (chat) {
        chat.addEventListener('click', async () => {
          chat.disabled = true;
          chat.textContent = 'Opening private chat…';

          try {
            const { data, error } = await sb.rpc('start_private_chat', {
              p_other_user: userId
            });
            if (error) throw error;

            const conversationId = data;
            if (!conversationId) throw new Error('The conversation could not be created.');

            window.location.href =
              `chat.html?conversation=${encodeURIComponent(conversationId)}&user=${encodeURIComponent(userId)}`;
          } catch (err) {
            console.error('Start chat error:', err);
            chat.disabled = false;
            chat.textContent = 'Start private chat →';

            const message = String(err?.message || '');
            if (message.includes('FREE_CHAT_LIMIT_REACHED')) {
              window.location.href = 'pricing.html';
            } else {
              alert(message || 'Could not start the private conversation.');
            }
          }
        });
      }
    });
  }

  async function loadUsage() {
    const meter = $('[data-free-remaining]');
    if (!meter || !window.UncoverAuth) return;

    try {
      const user = await window.UncoverAuth.getUser();
      if (!user) return;

      const sb = window.UncoverAuth.getClient();
      const { data } = await sb
        .from('profiles')
        .select('free_chats_used, free_chats_limit, is_premium')
        .eq('id', user.id)
        .maybeSingle();

      if (!data || data.is_premium) {
        meter.textContent = '∞';
        const strong = meter.parentElement?.querySelector('strong');
        if (strong) strong.innerHTML = '<span data-free-remaining>∞</span>';
        return;
      }

      const limit = Number(data.free_chats_limit ?? 3);
      const used = Number(data.free_chats_used ?? 0);
      meter.textContent = String(Math.max(0, limit - used));
    } catch (err) {
      console.warn('Could not load free-chat usage:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if ($('#discoverList')) {
      loadDiscover();
      loadUsage();
    }
  });
})();
