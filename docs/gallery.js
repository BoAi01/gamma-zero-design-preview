const robotCards = [...document.querySelectorAll('.robot-card')];
const search = document.querySelector('#robot-search');
const count = document.querySelector('#gallery-count');
const collectionSection = document.querySelector('#robots');
const collectionToggle = document.querySelector('#collection-toggle');
const collectionBottomToggle = document.querySelector('.collection-toggle-bottom');
const previewCount = 6;
const overviewCount = document.querySelector('[data-robot-count]');
if (overviewCount) overviewCount.textContent = robotCards.length;

const updateCollection = expanded => {
  if (!expanded) search.value = '';
  collectionSection.classList.toggle('is-expanded', expanded);
  collectionToggle.setAttribute('aria-expanded', String(expanded));
  collectionBottomToggle.setAttribute('aria-expanded', String(expanded));
  collectionBottomToggle.hidden = !expanded;
  collectionToggle.innerHTML = expanded ? 'Show fewer robots <span aria-hidden="true">↑</span>' : `Show all ${robotCards.length} robots <span aria-hidden="true">↓</span>`;
  const query = search.value.trim().toLowerCase().replaceAll('_', ' ');
  let matches = 0;
  for (const [index, card] of robotCards.entries()) {
    card.hidden = expanded ? !`${card.textContent} ${card.dataset.name.replaceAll('_', ' ')}`.toLowerCase().includes(query) : index >= previewCount;
    if (!card.hidden) matches++;
  }
  count.textContent = query || !expanded ? `${matches} of ${robotCards.length} robots` : `${robotCards.length} robots`;
  document.querySelector('.gallery-empty').hidden = matches !== 0;
};

for (const button of document.querySelectorAll('.collection-toggle')) button.addEventListener('click', () => {
  const expanding = !collectionSection.classList.contains('is-expanded');
  updateCollection(expanding);
  if (!expanding) {
    collectionToggle.focus({ preventScroll: true });
    if (collectionSection.getBoundingClientRect().top < 0) collectionSection.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
});

search.addEventListener('input', () => updateCollection(true));
