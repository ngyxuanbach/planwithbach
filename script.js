const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.site-nav');
menuToggle?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});
nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuToggle?.setAttribute('aria-expanded', 'false');
}));

document.querySelectorAll('.concept-toggle').forEach((button) => {
  button.addEventListener('click', () => {
    const more = button.nextElementSibling;
    const open = more.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
    button.querySelector('span').textContent = open ? '−' : '+';
  });
});

const readinessForm = document.getElementById('readinessForm');
const readinessResult = document.getElementById('readinessResult');
const readinessLabels = {
  'emergency savings': 'Emergency savings',
  'income disruption': 'Income disruption planning',
  'retirement target': 'Retirement income needs',
  'workplace benefits': 'Workplace benefits',
  'long-term care': 'Long-term care costs',
  'beneficiaries and documents': 'Beneficiaries and important documents'
};
readinessForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const reviewed = new Set([...readinessForm.querySelectorAll('input:checked')].map((input) => input.value));
  const next = Object.keys(readinessLabels).filter((topic) => !reviewed.has(topic));
  if (!next.length) {
    readinessResult.innerHTML = '<p class="result-kicker">Your learning list</p><h3>You have reviewed every topic listed here.</h3><p>A regular review can still be useful when your income, family, benefits, health, or goals change.</p>';
    return;
  }
  readinessResult.innerHTML = `<p class="result-kicker">Topics to explore next</p><h3>${next.length} area${next.length === 1 ? '' : 's'} may deserve another look.</h3><ul>${next.map((topic) => `<li>${readinessLabels[topic]}</li>`).join('')}</ul><p>This is an educational prompt, not a financial assessment or recommendation.</p>`;
});

const contactForm = document.getElementById('contactForm');
const formStatus = document.getElementById('formStatus');
contactForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  formStatus.classList.remove('error');
  const button = contactForm.querySelector('button[type="submit"]');
  const data = new FormData(contactForm);
  const payload = {
    firstName: data.get('firstName'), lastName: data.get('lastName'), email: data.get('email'), phone: data.get('phone'),
    languagePreference: data.get('languagePreference'), whereMet: data.get('whereMet'), message: data.get('message'),
    interests: data.getAll('interests'), consent: data.get('consent') === 'on', website: data.get('website')
  };
  button.disabled = true; button.textContent = 'Sending…';
  try {
    const response = await fetch('/api/contact', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to submit the form.');
    formStatus.textContent = 'Thank you. Your question was submitted, and Oscar will follow up using the contact information you provided.';
    contactForm.reset();
  } catch (error) {
    formStatus.classList.add('error');
    formStatus.textContent = `${error.message} You may also call 585-355-3020 or email bxnguyen@ft.newyorklife.com.`;
  } finally {
    button.disabled = false; button.textContent = 'Send My Question';
  }
});

const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
  if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
}), {threshold:.12});
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
document.getElementById('year').textContent = new Date().getFullYear();
