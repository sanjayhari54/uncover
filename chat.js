/* Uncover V9 — robust private chat routing + messaging */
(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const params = new URLSearchParams(location.search);
  let conversationId = params.get('conversation');
  let otherUserId = params.get('user');

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
    }[c]));
  }

  function messageHtml(m, me) {
    const mine = String(m.sender_id) === String(me);
    const time = m.created_at
      ? new Date(m.created_at).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})
      : '';
    return `<div class="msg${mine ? ' me' : ''}" data-message-id="${escapeHtml(m.id)}">
      <div class="msg-body">${escapeHtml(m.message ?? '')}</div>
      <small class="msg-time">${escapeHtml(time)}</small>
    </div>`;
  }


  function showInboxMode() {
    const inbox = $('#chatInbox'); const view = $('#chatConversationView');
    if (inbox) inbox.hidden = false;
    if (view) view.hidden = true;
  }
  function showConversationMode() {
    const inbox = $('#chatInbox'); const view = $('#chatConversationView');
    if (inbox) inbox.hidden = true;
    if (view) view.hidden = false;
  }
  async function renderInbox(sb, me) {
    showInboxMode();
    const activeList = $('#chatInboxActive');
    const blockedSection = $('#chatInboxBlockedSection');
    const blockedList = $('#chatInboxBlocked');
    if (!activeList) return;
    activeList.innerHTML = '<div class="loading-card">Loading your conversations…</div>';
    try {
      const { data: rows, error } = await sb.from('conversations')
        .select('id,user_a,user_b,status,created_at')
        .or(`user_a.eq.${me},user_b.eq.${me}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const { data: blockRows, error: blockError } = await sb.from('blocks')
        .select('blocker_id,blocked_id').or(`blocker_id.eq.${me},blocked_id.eq.${me}`);
      if (blockError) throw blockError;
      const blockedIds = new Set((blockRows || []).map(b => b.blocker_id === me ? b.blocked_id : b.blocker_id));
      const all = rows || [];
      const lastByConversation = new Map();
      if (all.length) {
        const { data: msgs, error: msgError } = await sb.from('messages')
          .select('conversation_id,message,sender_id,created_at')
          .in('conversation_id', all.map(c => c.id)).order('created_at', { ascending: false });
        if (msgError) throw msgError;
        for (const m of (msgs || [])) if (!lastByConversation.has(m.conversation_id)) lastByConversation.set(m.conversation_id, m);
      }
      const other = c => c.user_a === me ? c.user_b : c.user_a;
      const activity = c => lastByConversation.get(c.id)?.created_at || c.created_at;
      all.sort((a,b) => new Date(activity(b)) - new Date(activity(a)));
      const dedupe = arr => { const seen = new Set(); return arr.filter(c => { const id=other(c); if (!id || seen.has(id)) return false; seen.add(id); return true; }); };
      const active = dedupe(all.filter(c => c.status === 'active' && !blockedIds.has(other(c))));
      const blocked = dedupe(all.filter(c => blockedIds.has(other(c))));
      const { data: connRows } = await sb.rpc('my_connections');
      const connByOther = new Map((connRows || []).map(r => [r.other_user_id, r]));
      const { data: partnerRows } = await sb.rpc('my_chat_partners');
      const emojiByOther = new Map((partnerRows || []).map(r => [r.other_user_id, r.anon_emoji]));
      const revealedInfo = new Map();
      await Promise.all(active.filter(c => connByOther.get(other(c))?.revealed).map(async c => {
        const id = other(c);
        try {
          const { data: p } = await sb.rpc('get_revealed_profile', { p_other_user: id });
          const prof = Array.isArray(p) ? p[0] : p;
          if (!prof) return;
          let photo = '';
          if (prof.photo_url) { try { const { data: s } = await sb.storage.from('profile-photos').createSignedUrl(prof.photo_url, 3600); photo = s?.signedUrl || ''; } catch (_) {} }
          revealedInfo.set(id, { name: prof.display_name || 'Connection', photo });
        } catch (_) {}
      }));
      const row = (c, isBlocked=false) => {
        const msg = lastByConversation.get(c.id);
        const snippet = isBlocked ? 'Conversation closed · blocked' : (msg ? ((msg.sender_id === me ? 'You: ' : '') + String(msg.message || '').slice(0,85)) : 'Start the conversation with a thoughtful hello.');
        const when = activity(c) ? new Date(activity(c)).toLocaleDateString([], {month:'short',day:'numeric'}) : '';
        const conn = connByOther.get(other(c)); const info = isBlocked ? null : revealedInfo.get(other(c));
        const mineLiked = conn ? (conn.is_incoming ? conn.receiver_approved : conn.sender_approved) : false;
        const theirsLiked = conn ? (conn.is_incoming ? conn.sender_approved : conn.receiver_approved) : false;
        const badge = (!isBlocked && conn && !conn.revealed && theirsLiked && !mineLiked) ? '<span class="chat-badge">♥ Liked you</span>' : '';
        const orbStyle = info && info.photo ? ' style="background-image:url(&quot;' + escapeHtml(info.photo) + '&quot;);background-size:cover;background-position:center;color:transparent"' : '';
        const orbText = isBlocked ? '×' : (info ? escapeHtml((info.name || 'U').trim().charAt(0).toUpperCase()) : (emojiByOther.get(other(c)) || '?'));
        const title = isBlocked ? 'Blocked conversation' : (info ? escapeHtml(info.name) : 'Anonymous conversation');
        return `<article class="chat-inbox-row${isBlocked?' blocked':''}"><div class="chat-orb"${orbStyle} aria-hidden="true">${orbText}</div><div class="chat-row-copy"><h3>${title}</h3><p>${escapeHtml(snippet)}</p></div>${badge}<span class="chat-row-time">${escapeHtml(when)}</span>${isBlocked?'<span class="muted" style="font-size:12px">Closed</span>':`<button class="btn dark" type="button" data-inbox-open="${escapeHtml(c.id)}" data-inbox-user="${escapeHtml(other(c))}">Open →</button>`}</article>`;
      };
      activeList.innerHTML = active.map(c => row(c)).join('') || '<div class="chat-inbox-empty">No active chats yet. Start a private conversation from Discover.</div>';
      activeList.querySelectorAll('[data-inbox-open]').forEach(btn => btn.addEventListener('click', () => {
        const url = new URL('chat.html', location.href); url.searchParams.set('conversation',btn.dataset.inboxOpen); url.searchParams.set('user',btn.dataset.inboxUser); location.href=url.href;
      }));
      if (blockedSection && blockedList) {
        blockedSection.hidden = !blocked.length;
        blockedList.innerHTML = blocked.map(c => row(c,true)).join('');
      }
    } catch (err) {
      console.error('Chat inbox error:', err);
      activeList.innerHTML = `<div class="loading-card"><strong>Could not load chats.</strong><span class="muted">${escapeHtml(err?.message || 'Refresh and try again.')}</span></div>`;
    }
  }

  async function boot() {
    const list = $('#messages');
    const form = $('#chatForm');
    const input = $('#messageInput');
    try {
      const auth = window.UncoverAuth;
      if (!auth?.getClient) throw new Error('Authentication is not available.');
      const user = await auth.getUser();
      if (!user) { location.href = 'login.html'; return; }
      const sb = auth.getClient();
      const me = user.id;

      // No conversation in the URL means show the inbox, not an arbitrary latest chat.
      if (!conversationId || !UUID.test(conversationId)) {
        if (otherUserId && UUID.test(otherUserId)) {
          const { data: ownRows, error: ownError } = await sb.from('conversations')
            .select('id,user_a,user_b,status,created_at')
            .or(`user_a.eq.${me},user_b.eq.${me}`)
            .eq('status','active').order('created_at',{ascending:false});
          if (ownError) throw ownError;
          const match = (ownRows || []).find(c => (c.user_a === me ? c.user_b : c.user_a) === otherUserId);
          if (match) conversationId = match.id;
          else { await renderInbox(sb, me); return; }
        } else { await renderInbox(sb, me); return; }
      }
      showConversationMode();
      if (!list || !form || !input) return;

      // A block must close the chat view for both people, not merely reject sends.
      const { data: blockRows, error: blockCheckError } = await sb
        .from('blocks')
        .select('id')
        .or(`and(blocker_id.eq.${me},blocked_id.eq.${otherUserId || '00000000-0000-0000-0000-000000000000'}),and(blocker_id.eq.${otherUserId || '00000000-0000-0000-0000-000000000000'},blocked_id.eq.${me})`)
        .limit(1);
      if (blockCheckError) console.warn('Could not pre-check block status:', blockCheckError);
      if (blockRows?.length) {
        list.innerHTML = '<div class="loading-card"><strong>This chat is unavailable.</strong><span class="muted">One of you has blocked the other. This conversation is closed.</span></div>';
        form.style.display = 'none';
        document.querySelectorAll('[data-like-connection], #reportUserBtn, #blockUserBtn').forEach(el => el.disabled = true);
        return;
      }

      // Verify membership.
      const { data: convo, error: convoError } = await sb
        .from('conversations')
        .select('id,user_a,user_b,status')
        .eq('id', conversationId)
        .maybeSingle();

      if (convoError) throw convoError;
      if (!convo || (convo.user_a !== me && convo.user_b !== me)) {
        throw new Error('You do not have access to this conversation.');
      }

      otherUserId = convo.user_a === me ? convo.user_b : convo.user_a;

      async function applyPartnerEmoji() {
        try {
          const { data } = await sb.rpc('my_chat_partners');
          const hit = (data || []).find(x => x.other_user_id === otherUserId);
          const orb = $('.mini-orb');
          if (hit && hit.anon_emoji && orb && !orb.dataset.revealed) orb.textContent = hit.anon_emoji;
        } catch (_) {}
      }
      async function applyConnectionState() {
        await applyPartnerEmoji();
        try {
          const { data: conns } = await sb.rpc('my_connections');
          const conn = (conns || []).find(r => r.other_user_id === otherUserId);
          const mine = conn ? (conn.is_incoming ? conn.receiver_approved : conn.sender_approved) : false;
          const theirs = conn ? (conn.is_incoming ? conn.sender_approved : conn.receiver_approved) : false;
          const nameEl = $('.chat-anon strong'), subEl = $('.chat-anon small'), orb = $('.mini-orb');
          const banner = $('.privacy-banner'), sideTitle = $('.chat-side h2'), sideText = $('.chat-side p.muted');
          const likeBtns = document.querySelectorAll('[data-like-connection]');
          if (conn && conn.revealed) {
            const { data: p } = await sb.rpc('get_revealed_profile', { p_other_user: otherUserId });
            const prof = Array.isArray(p) ? p[0] : p;
            if (prof) {
              if (nameEl) nameEl.textContent = prof.display_name || 'Connection';
              if (subEl) subEl.textContent = 'Connected · profiles revealed';
              if (orb) {
                orb.dataset.revealed = '1';
                orb.textContent = (prof.display_name || 'U').trim().charAt(0).toUpperCase();
                if (prof.photo_url) {
                  try {
                    const { data: s } = await sb.storage.from('profile-photos').createSignedUrl(prof.photo_url, 3600);
                    if (s?.signedUrl) { orb.style.backgroundImage = 'url("' + s.signedUrl + '")'; orb.style.backgroundSize = 'cover'; orb.style.backgroundPosition = 'center'; orb.style.color = 'transparent'; }
                  } catch (_) {}
                }
              }
            }
            if (banner) banner.textContent = '✓ You both approved. Your profiles are now visible to each other.';
            if (sideTitle) sideTitle.textContent = 'You’re connected';
            if (sideText) sideText.textContent = 'You both said yes. Keep chatting, or open Connections to see their full profile.';
            likeBtns.forEach(b => { b.hidden = true; });
          } else if (mine) {
            if (sideTitle) sideTitle.textContent = 'Waiting for them';
            if (sideText) sideText.textContent = 'You liked this conversation. Your profile stays hidden until they like back.';
            likeBtns.forEach(b => { b.textContent = 'Liked ♥'; b.disabled = true; b.dataset.liked = '1'; });
          } else if (theirs) {
            if (banner) banner.textContent = '♥ They liked this conversation. Like back to reveal your profiles to each other.';
            if (sideTitle) sideTitle.textContent = 'They liked you';
            if (sideText) sideText.textContent = 'Like back and you will both see each other’s profile. If you’re not sure yet, keep chatting.';
            likeBtns.forEach(b => { b.textContent = 'Like back ♥'; });
          }
        } catch (e) { console.warn('Could not load connection state:', e); }
      }
      await applyConnectionState();
      setInterval(() => { if (!document.hidden) applyConnectionState(); }, 20000);

      function scrollMessagesToBottom() {
        // Scroll the message pane itself and ensure the newest bubble is visible.
        requestAnimationFrame(() => {
          list.scrollTop = list.scrollHeight;
          const last = list.querySelector('.msg:last-of-type');
          if (last) last.scrollIntoView({ block: 'end', behavior: 'auto' });
        });
      }

      async function loadMessages() {
        const { data, error } = await sb
          .from('messages')
          .select('id,conversation_id,sender_id,message,created_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (!data?.length) {
          list.innerHTML = '<div class="loading-card"><strong>Your private conversation starts here.</strong><span class="muted">Say hello and get to know each other.</span></div>';
        } else {
          list.innerHTML = data.map(m => messageHtml(m, me)).join('');
          scrollMessagesToBottom();
        }
      }

      await loadMessages();

      const channel = sb.channel(`uncover-chat-${conversationId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        }, payload => {
          const m = payload.new;
          if (!m?.id || list.querySelector(`[data-message-id="${CSS.escape(String(m.id))}"]`)) return;
          list.querySelector('.loading-card')?.remove();
          list.insertAdjacentHTML('beforeend', messageHtml(m, me));
          scrollMessagesToBottom();
        })
        .subscribe(status => console.log('Uncover chat realtime:', status));

      form.addEventListener('submit', async e => {
        e.preventDefault();
        const content = input.value.trim();
        if (!content) return;

        const button = form.querySelector('button[type="submit"]');
        input.disabled = true;
        if (button) button.disabled = true;

        try {
          const { data, error } = await sb
            .from('messages')
            .insert({ conversation_id: conversationId, sender_id: me, message: content })
            .select('id,conversation_id,sender_id,message,created_at')
            .single();

          if (error) throw error;

          list.querySelector('.loading-card')?.remove();
          if (!list.querySelector(`[data-message-id="${CSS.escape(String(data.id))}"]`)) {
            list.insertAdjacentHTML('beforeend', messageHtml(data, me));
          }
          scrollMessagesToBottom();
          input.value = '';
        } catch (err) {
          console.error('Uncover send message error:', err);
          alert(err?.message || 'Message could not be sent.');
        } finally {
          input.disabled = false;
          if (button) button.disabled = false;
          input.focus();
        }
      });

      document.querySelectorAll('[data-like-connection]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const { data, error } = await sb.rpc('approve_connection', { p_other_user: otherUserId });
            if (error) throw error;
            alert(data === true ? 'It’s a match! Both of you approved. Your profiles are now revealed.' : 'Your like has been sent. Your profile stays hidden until they like back.');
            await applyConnectionState();
          } catch (err) {
            console.error('Connection error:', err);
            alert(err?.message || 'Could not send the connection request.');
          } finally {
            if (btn.dataset.liked !== '1' && !btn.hidden) btn.disabled = false;
          }
        });
      });

      const blockBtn = $('#blockUserBtn');
      const reportBtn = $('#reportUserBtn');

      if (blockBtn) blockBtn.addEventListener('click', async () => {
        if (!confirm('Block this person? You will no longer discover or chat with each other.')) return;
        blockBtn.disabled = true;
        try {
          const { error } = await sb.rpc('block_user', { p_other_user: otherUserId });
          if (error) throw error;
          // Clear the chat immediately so it cannot appear to remain active.
          list.innerHTML = '<div class="loading-card"><strong>Chat blocked.</strong><span class="muted">This conversation is now closed.</span></div>';
          form.style.display = 'none';
          document.querySelectorAll('[data-like-connection], #reportUserBtn, #blockUserBtn').forEach(el => el.disabled = true);
          alert('This person has been blocked. The conversation is closed.');
          location.href = 'app.html';
        } catch (err) {
          console.error('Block error:', err);
          alert(err?.message || 'Could not block this person.');
          blockBtn.disabled = false;
        }
      });

      if (reportBtn) reportBtn.addEventListener('click', async () => {
        const reason = prompt('Why are you reporting this person?');
        if (!reason || !reason.trim()) return;
        reportBtn.disabled = true;
        try {
          const { error } = await sb.rpc('report_user', {
            p_other_user: otherUserId,
            p_reason: reason.trim().slice(0, 500)
          });
          if (error) throw error;
          alert('Thank you. Your report has been submitted.');
        } catch (err) {
          console.error('Report error:', err);
          alert(err?.message || 'Could not submit the report.');
        } finally {
          reportBtn.disabled = false;
        }
      });

      window.addEventListener('beforeunload', () => {
        try { sb.removeChannel(channel); } catch (_) {}
      });
    } catch (err) {
      console.error('Uncover chat boot error:', err);
      list.innerHTML = `<div class="loading-card"><strong>We couldn't open this private chat.</strong><span class="muted">${escapeHtml(err?.message || 'Please return to Discover and try again.')}</span></div>`;
      form.style.display = 'none';
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
