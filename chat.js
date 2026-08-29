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
      <div class="msg-body">${escapeHtml(m.content ?? m.body ?? '')}</div>
      <small class="msg-time">${escapeHtml(time)}</small>
    </div>`;
  }

  async function boot() {
    const list = $('#messages');
    const form = $('#chatForm');
    const input = $('#messageInput');
    if (!list || !form || !input) return;

    try {
      const auth = window.UncoverAuth;
      if (!auth?.getClient) throw new Error('Authentication is not available.');

      const user = await auth.getUser();
      if (!user) {
        location.href = 'login.html';
        return;
      }

      const sb = auth.getClient();
      const me = user.id;

      // Recover a missing/invalid URL by finding the user's newest conversation.
      if (!conversationId || !UUID.test(conversationId)) {
        const { data: recent, error } = await sb
          .from('conversations')
          .select('id,user_a,user_b,status,created_at')
          .or(`user_a.eq.${me},user_b.eq.${me}`)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        const latest = recent?.[0];

        if (!latest) {
          list.innerHTML = '<div class="loading-card"><strong>No private chat found.</strong><span class="muted">Return to Discover and start a new conversation.</span></div>';
          form.style.display = 'none';
          return;
        }

        conversationId = latest.id;
        otherUserId = latest.user_a === me ? latest.user_b : latest.user_a;

        const recovered = new URL('chat.html', location.href);
        recovered.searchParams.set('conversation', conversationId);
        recovered.searchParams.set('user', otherUserId);
        history.replaceState({}, '', recovered.href);
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

      async function loadMessages() {
        const { data, error } = await sb
          .from('messages')
          .select('id,conversation_id,sender_id,content,created_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (!data?.length) {
          list.innerHTML = '<div class="loading-card"><strong>Your private conversation starts here.</strong><span class="muted">Say hello and get to know each other.</span></div>';
        } else {
          list.innerHTML = data.map(m => messageHtml(m, me)).join('');
          list.scrollTop = list.scrollHeight;
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
          list.scrollTop = list.scrollHeight;
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
            .insert({ conversation_id: conversationId, sender_id: me, content })
            .select('id,conversation_id,sender_id,content,created_at')
            .single();

          if (error) throw error;

          list.querySelector('.loading-card')?.remove();
          if (!list.querySelector(`[data-message-id="${CSS.escape(String(data.id))}"]`)) {
            list.insertAdjacentHTML('beforeend', messageHtml(data, me));
          }
          list.scrollTop = list.scrollHeight;
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
            if (data === true) {
              location.href = 'connections.html';
            } else {
              alert('Your approval has been recorded. The profile stays hidden until the other person approves too.');
            }
          } catch (err) {
            console.error('Connection error:', err);
            alert(err?.message || 'Could not send the connection request.');
          } finally {
            btn.disabled = false;
          }
        });
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
