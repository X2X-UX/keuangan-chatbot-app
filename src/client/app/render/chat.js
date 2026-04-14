function appendChatMessage(role, content) {
  const fragment = elements.chatTemplate.content.cloneNode(true);
  const bubble = fragment.querySelector(".chat-bubble");
  const roleLabel = fragment.querySelector(".chat-role");
  const text = fragment.querySelector(".chat-text");

  bubble.classList.add(role);
  bubble.classList.add(role === "assistant" ? "tw-chat-bubble-assistant" : "tw-chat-bubble-user");
  roleLabel.textContent = role === "assistant" ? "Asisten" : "Anda";
  text.textContent = content;
  elements.chatMessages.appendChild(fragment);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function resetChat() {
  elements.chatMessages.innerHTML = "";
  state.chatHistory = [];

  const intro = state.user
    ? `Halo ${state.user.name}, saya siap membantu menganalisis kondisi keuangan akun Anda.`
    : "Silakan masuk terlebih dahulu agar saya dapat membaca data keuangan akun Anda.";

  appendChatMessage("assistant", intro);
  state.chatHistory.push({ role: "assistant", content: intro });
}

