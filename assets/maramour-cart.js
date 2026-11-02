/*
 * MARAMOUR — Compra rápida en las sugerencias del carrito (snippets/maramour-cart-recs.liquid).
 * Tocar un color muestra sus talles; tocar un talle agrega esa variante y avisa al carrito de
 * Horizon con el mismo evento que usa el botón de la página de producto (así se actualiza el
 * cajón, el contador y la barra de envío gratis sin recargar).
 */
import { CartLinesUpdateEvent } from '@shopify/events';

const pickColor = (button) => {
  const card = button.closest('[data-mm-qa]');
  if (!card) return;
  const value = button.dataset.mmQaColor;
  card.querySelectorAll('[data-mm-qa-color]').forEach((b) => b.setAttribute('aria-checked', String(b === button)));
  card.querySelectorAll('[data-mm-qa-group]').forEach((g) => (g.hidden = g.dataset.mmQaGroup !== value));
};

const sectionIds = () =>
  [...document.querySelectorAll('cart-items-component')]
    .map((el) => (el instanceof HTMLElement ? el.dataset.sectionId : ''))
    .filter(Boolean)
    .join(',');

const fetchCart = async () => {
  const items = document.querySelector('cart-items-component');
  if (items && 'fetchCartData' in items) {
    await customElements.whenDefined('cart-items-component');
    return items.fetchCartData();
  }
  return fetch(`${Theme.routes.cart_url}.json`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
};

const add = async (button) => {
  const card = button.closest('[data-mm-qa]');
  const msg = card?.querySelector('[data-mm-qa-msg]');
  const id = Number(button.dataset.mmQaAdd);
  if (!id || button.disabled) return;

  card?.querySelectorAll('[data-mm-qa-add]').forEach((b) => b.setAttribute('aria-busy', 'true'));
  button.classList.add('is-loading');

  const deferred = CartLinesUpdateEvent.createPromise();
  button.dispatchEvent(
    new CartLinesUpdateEvent({
      action: 'add',
      context: 'product',
      lines: [{ merchandiseId: String(id), quantity: 1 }],
      promise: deferred.promise,
    })
  );

  try {
    const response = await fetch(Theme.routes.cart_add_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id, quantity: 1 }], sections: sectionIds() }),
    }).then((r) => r.json());

    const ajaxCart = await fetchCart();
    deferred.resolve({
      cart: CartLinesUpdateEvent.createCartFromAjaxResponse(ajaxCart),
      detail: {
        items: ajaxCart.items,
        source: 'maramour-cart-recs',
        itemCount: 1,
        sections: response.sections,
        didError: Boolean(response.status),
      },
    });

    if (response.status && msg) msg.textContent = response.description || response.message || 'No pudimos agregarla. Probá de nuevo.';
  } catch (error) {
    deferred.reject(error);
    if (msg) msg.textContent = 'No pudimos agregarla. Probá de nuevo.';
  } finally {
    button.classList.remove('is-loading');
    card?.querySelectorAll('[data-mm-qa-add]').forEach((b) => b.removeAttribute('aria-busy'));
  }
};

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const color = target?.closest('[data-mm-qa-color]');
  if (color) return pickColor(color);
  const addButton = target?.closest('[data-mm-qa-add]');
  if (addButton instanceof HTMLButtonElement) add(addButton);
});
