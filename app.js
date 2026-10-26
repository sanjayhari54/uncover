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

    // Anonymous cards show only an age range, gender (if shared), interests and intent.
    const age = person.age_range ? escapeHtml(person.age_range) : '18+';
    const gender = person.gender ? escapeHtml(person.gender) : '';

    return `
      <article class="discover-card" data-user-id="${escapeHtml(person.user_id)}">
        <div class="discover-avatar" aria-hidden="true">?</div>
        <div class="discover-content">
          <div class="discover-top">
            <div>
              <p class="eyebrow">ANONYMOUS</p>
              <h2>Someone</h2>
              <p class="muted">${age}${gender ? ' · ' + gender : ''}</p>
            </div>
            <span class="status-dot" title="Discoverable"></span>
          </div>
          <div class="tags">${interestHtml}</div>
          <p class="discover-looking"><strong>Looking for:</strong> ${lookingHtml}</p>
          <div class="discover-actions">
            <button class="btn outline pass-btn" type="button" data-action="pass">Pass</button>
            <button class="btn dark chat-btn" type="button" data-action="chat">Start private chat →</button>
          </div>
        </div>
      </article>`;
  }


  async function loadNotifications() {
    const section = $('#notificationSection');
    const list = $('#notificationList');
    if (!section || !list || !window.UncoverAuth) return;
    try {
      const user = await window.UncoverAuth.getUser();
      if (!user) return;
      const sb = window.UncoverAuth.getClient();
      const { data, error } = await sb.rpc('my_notifications', { p_limit: 20 });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) { section.hidden = true; return; }
      section.hidden = false;
      list.innerHTML = rows.map(n => {
        const title = n.kind === 'like' ? 'Someone liked you' : n.kind === 'message' ? 'New private message' :
          n.kind === 'connection' ? 'Connection update' : 'Safety update';
        const text = n.kind === 'like' ? 'Someone liked your conversation. Like back to reveal profiles.' : n.kind === 'message' ? 'Someone sent you a message.' :
          n.kind === 'connection' ? 'Someone approved your connection.' :
          'Your safety action was completed.';
        const when = n.created_at ? new Date(n.created_at).toLocaleString() : '';
        const action = n.conversation_id
          ? `<a class="btn dark" href="chat.html?conversation=${encodeURIComponent(n.conversation_id)}&user=${encodeURIComponent(n.other_user_id || '')}">Open chat →</a>`
          : (n.kind === 'connection' ? '<a class="btn dark" href="connections.html">View connections →</a>' : '');
        return `<article class="discover-card" style="margin-bottom:12px;">
          <div class="discover-avatar" aria-hidden="true">!</div>
          <div class="discover-content"><p class="eyebrow">${escapeHtml(title)}</p>
          <h2>${escapeHtml(text)}</h2><p class="muted">${escapeHtml(when)}</p>
          <div class="discover-actions">${action}</div></div></article>`;
      }).join('');
    } catch (err) {
      console.warn('Could not load notifications:', err);
      section.hidden = true;
    }
  }

  async function loadChats() {
    const list = $('#chatList');
    const section = $('#chatSection');
    const blockedSection = $('#blockedChatSection');
    const blockedList = $('#blockedChatList');
    if (!list || !section || !window.UncoverAuth) return;
    try {
      const user = await window.UncoverAuth.getUser();
      if (!user) return;
      const sb = window.UncoverAuth.getClient();
      const { data, error } = await sb.from('conversations')
        .select('id,user_a,user_b,status,created_at')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .eq('status', 'active').order('created_at', { ascending: false });
      if (error) throw error;
      const { data: blockRows, error: blockError } = await sb.from('blocks')
        .select('blocker_id,blocked_id').or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
      if (blockError) throw blockError;
      const blockedIds = new Set((blockRows || []).map(b => b.blocker_id === user.id ? b.blocked_id : b.blocker_id));
      const allChats = data || [];
      const blockedChats = allChats.filter(c => blockedIds.has(c.user_a === user.id ? c.user_b : c.user_a));
      const activeChats = allChats.filter(c => !blockedIds.has(c.user_a === user.id ? c.user_b : c.user_a));
      const ids = allChats.map(c => c.id);
      const lastActivity = new Map();
      if (ids.length) {
        const { data: recentMessages, error: messagesError } = await sb.from('messages')
          .select('conversation_id,created_at').in('conversation_id', ids).order('created_at', { ascending: false });
        if (messagesError) throw messagesError;
        for (const m of (recentMessages || [])) if (!lastActivity.has(m.conversation_id)) lastActivity.set(m.conversation_id, m.created_at);
      }
      const sorter = (a,b) => new Date(lastActivity.get(b.id) || b.created_at) - new Date(lastActivity.get(a.id) || a.created_at);
      activeChats.sort(sorter); blockedChats.sort(sorter);
      // Deduplicate by the other person's user ID, after sorting by latest message.
      function uniqueByPerson(rows) {
        const seen = new Set();
        return rows.filter(c => { const other = c.user_a === user.id ? c.user_b : c.user_a; if (!other || seen.has(other)) return false; seen.add(other); return true; });
      }
      const uniqueActive = uniqueByPerson(activeChats);
      const uniqueBlocked = uniqueByPerson(blockedChats);
      const { data: connRows } = await sb.rpc('my_connections');
      const connByOther = new Map((connRows || []).map(r => [r.other_user_id, r]));
      const names = new Map();
      await Promise.all(uniqueActive.filter(c => connByOther.get(c.user_a === user.id ? c.user_b : c.user_a)?.revealed).map(async c => {
        const id = c.user_a === user.id ? c.user_b : c.user_a;
        try {
          const { data: p } = await sb.rpc('get_revealed_profile', { p_other_user: id });
          const prof = Array.isArray(p) ? p[0] : p;
          if (prof?.display_name) names.set(id, prof.display_name);
        } catch (_) {}
      }));
      const rowHtml = (c, blocked=false) => {
        const other = c.user_a === user.id ? c.user_b : c.user_a;
        const activity = lastActivity.get(c.id) || c.created_at;
        const stamp = activity ? new Date(activity).toLocaleDateString([], {month:'short',day:'numeric'}) : '';
        const name = blocked ? null : names.get(other);
        const conn = connByOther.get(other);
        const theirsLiked = conn ? (conn.is_incoming ? conn.sender_approved : conn.receiver_approved) : false;
        const mineLiked = conn ? (conn.is_incoming ? conn.receiver_approved : conn.sender_approved) : false;
        const badge = (!blocked && conn && !conn.revealed && theirsLiked && !mineLiked) ? '<span class="chat-badge">♥ Liked you</span>' : '';
        return `<article class="chat-row${blocked?' blocked':''}"><div class="chat-orb" aria-hidden="true">${blocked?'×':(name?escapeHtml(name.trim().charAt(0).toUpperCase()):'?')}</div><div class="chat-row-copy"><h3>${blocked?'Blocked conversation':(name?escapeHtml(name):'Someone you’re talking to')}</h3><p>${blocked?'Chat closed · blocked':('Private conversation · '+escapeHtml(stamp))}</p></div>${badge}${blocked?'<span class="muted" style="font-size:12px">Closed</span>':`<button class="btn dark" type="button" data-open-chat="${escapeHtml(c.id)}" data-other-user="${escapeHtml(other)}">Open chat →</button>`}</article>`;
      };
      section.hidden = !uniqueActive.length && !uniqueBlocked.length;
      list.innerHTML = uniqueActive.map(c => rowHtml(c)).join('') || '<div class="loading-card">No active private chats yet.</div>';
      if (blockedSection && blockedList) {
        blockedSection.hidden = !uniqueBlocked.length;
        blockedList.innerHTML = uniqueBlocked.map(c => rowHtml(c,true)).join('');
      }
      list.querySelectorAll('[data-open-chat]').forEach(btn => btn.addEventListener('click', () => {
        const url = new URL('chat.html', window.location.href);
        url.searchParams.set('conversation', btn.dataset.openChat); url.searchParams.set('user', btn.dataset.otherUser); window.location.assign(url.href);
      }));
    } catch (err) {
      console.error('Could not load private chats:', err);
      section.hidden = false;
      list.innerHTML = '<div class="loading-card"><strong>Could not load chats.</strong><span class="muted">Refresh the page and try again.</span></div>';
    }
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

      // Members must finish their profile (including date of birth) before discovering people.
      const { data: me } = await sb.from('profiles')
        .select('is_profile_complete,birth_date').eq('id', user.id).maybeSingle();
      if (!me || !me.is_profile_complete || !me.birth_date) {
        window.location.href = 'profile.html';
        return;
      }

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

            // Supabase RPCs can return either a scalar UUID or a one-row object.
            const conversationId = typeof data === 'string'
              ? data
              : (data?.id || data?.conversation_id || data?.conversationId);

            const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!conversationId || !uuidRe.test(String(conversationId))) {
              console.error('Unexpected start_private_chat response:', data);
              throw new Error('Uncover created the chat but did not receive a valid conversation ID. Please try again.');
            }

            // Use a relative URL so GitHub Pages paths are preserved.
            const chatUrl = new URL('chat.html', window.location.href);
            chatUrl.searchParams.set('conversation', conversationId);
            chatUrl.searchParams.set('user', userId);
            window.location.assign(chatUrl.href);
          } catch (err) {
            console.error('Start chat error:', err);
            chat.disabled = false;
            chat.textContent = 'Start private chat →';

            const message = String(err?.message || '');
            if (message.includes('FREE_CHAT_LIMIT_REACHED')) {
              window.location.href = 'pricing.html';
            } else if (message.includes('PROFILE_INCOMPLETE')) {
              window.location.href = 'profile.html';
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
      loadNotifications();
      loadChats();
      // Keep the chat list fresh while the dashboard is open; a new message
      // re-sorts the active conversation to the top without a manual refresh.
      try {
        const sb = window.UncoverAuth?.getClient?.();
        if (sb) sb.channel('uncover-dashboard-chat-order')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => loadChats())
          .subscribe();
      } catch (e) { console.warn('Live chat ordering unavailable:', e); }
      loadDiscover();
      loadUsage();
    }
  });
})();
