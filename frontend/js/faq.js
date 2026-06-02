document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('open');
      navLinks.classList.toggle('open');
    });
  }

  const form = document.getElementById('faqForm');
  const btn = document.getElementById('faqSubmitBtn');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('faqName').value.trim();
      const email = document.getElementById('faqEmail').value.trim();
      const phone = document.getElementById('faqPhone')?.value.trim() || '';
      const query = document.getElementById('faqQuery').value.trim();

      if (!name || !email || !query) {
        showToast('Please fill all required fields', 'error');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Submitting...';

      try {
        const response = await fetch('/api/faqs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name, email, phone, query })
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast('Query submitted successfully!', 'success');
          form.reset();
        } else {
          showToast(data.message || 'Failed to submit query', 'error');
        }
      } catch (err) {
        showToast('Network error, please try again', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Submit Query';
      }
    });
  }
});
