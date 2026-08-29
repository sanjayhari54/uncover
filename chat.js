/* Uncover V8 — real private chat
   Uses the existing conversations/messages tables and Supabase Realtime.
*/
(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const conversationId = params.get('conversation');
  const otherUserId = params.get('user') || params.get('other');

  const $ = (s, root = document) => root.querySelector(s);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
    }[ch]));
  }

  function renderMessage(m, me) {
    const mine = m.sender_id === me;
    const time = m.created_at
      ? new Date(m.created_at).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})
      : '';
    return `<div class="msg${mine ? ' me' : ''}">
      <div class="msg-body">${escapeHtml(m.content)}</div>
      <small class="msg-time">${escapeHtml(time)}</small>
    </div>`;
  }

  async function boot() {
    const list = $('#messages');
    const form = $('#chatForm');
    const input = $('#messageInput');

    if (!list || !form || !input) return;

    if (!conversationId) {
      list.innerHTML = '<div class="loading-card"><strong>Conversation not found.</strong><span class="muted">Return to Discover and start a private chat again.</span></div>';
      form.style.display = 'none';
      return;
    }

    try {
      const auth = window.UncoverAuth;
      if (!auth || !auth.getClient) throw new Error('Authentication is not available.');

      const user = await auth.getUser();
      if (!user) {
        location.href = 'login.html';
        return;
      }

      const sb = auth.getClient();
      const me = user.id;

      // Verify the current user is actually a participant before loading messages.
      const { data: convo, error: convoError } = await sb
        .from('conversations')
        .select('id,user_a,user_b,status')
        .eq('id', conversationId)
        .maybeSingle();

      if (convoError) throw convoError;
      if (!convo || (convo.user_a !== me && convo.user_b !== me)) {
        throw new Error('You do not have access to this conversation.');
      }

      const other = convo.user_a === me ? convo.user_b : convo.user_a;

      // Load existing messages.
      async function loadMessages() {
        const { data, error } = await sb
          .from('messages')
          .select('id,conversation_id,sender_id,content,created_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (!data || !data.length) {
          list.innerHTML = '<div class="loading-card"><strong>Your private conversation starts here.</strong><span class="muted">Say hello and get to know each other.</span></div>';
        } else {
          list.innerHTML = data.map(m => renderMessage(m, me)).join('');
          list.scrollTop = list.scrollHeight;
        }
      }

      await loadMessages();

      // Subscribe to new messages so both users see replies without refreshing.
      const channel = sb.channel(`uncover-chat-${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`
          },
          payload => {
            const m = payload.new;
            if (!document.querySelector(`[data-message-id="${CSS.escape(String(m.id))}"]`)) {
              const empty = list.querySelector('.loading-card');
              if (empty) empty.remove();
              const wrapper = document.createElement('div');
              wrapper.dataset.messageId = m.id;
              wrapper.innerHTML = renderMessage(m, me);
              list.appendChild(wrapper.firstElementChild);
              list.scrollTop = list.scrollHeight;
            }
          }
        )
        .subscribe(status => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('Realtime chat subscription failed; messages can still be refreshed.');
          }
        });

      form.addEventListener('submit', async e => {
        e.preventDefault();
        const content = input.value.trim();
        if (!content) return;

        const button = form.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        input.disabled = true;

        try {
          const { data, error } = await sb
            .from('messages')
            .insert({
              conversation_id: conversationId,
              sender_id: me,
              content
            })
            .select('id,conversation_id,sender_id,content,created_at')
            .single();

          if (error) throw error;

          const empty = list.querySelector('.loading-card');
          if (empty) empty.remove();

          // Render immediately; realtime event is deduplicated.
          const wrapper = document.createElement('div');
          wrapper.dataset.messageId = data.id;
          wrapper.innerHTML = renderMessage(data, me);
          list.appendChild(wrapper.firstElementChild);
          list.scrollTop = list.scrollHeight;
          input.value = '';
        } catch (err) {
          console.error('Send message error:', err);
          alert(err?.message || 'Message could not be sent.');
        } finally {
          input.disabled = false;
          if (button) button.disabled = false;
          input.focus();
        }
      });

      // Make the Like button use the actual conversation's other participant.
      document.querySelectorAll('[data-like-connection]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const { data, error } = await sb.rpc('approve_connection', { p_other_user: other });
            if (error) throw error;
            if (data === true) {
              alert('You both approved. The profile can now be revealed.');
              location.href = `connections.html`;
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
      console.error('Chat boot error:', err);
      list.innerHTML = `<div class="loading-card"><strong>We couldn't open this private chat.</strong><span class="muted">${escapeHtml(err?.message || 'Please return to Discover and try again.')}</span></div>`;
      form.style.display = 'none';
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
