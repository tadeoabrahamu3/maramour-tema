/*
 * MARAMOUR — Utilidades de la página de producto.
 *
 * <mm-variant-sync data-mm-sync="clave">: cuando la clienta cambia de color o talle, Horizon pide
 * al servidor la sección con la nueva variante. Este elemento reemplaza su contenido por el de la
 * respuesta (mismo data-mm-sync), así cuotas, transferencia, stock y aviso de stock se actualizan
 * sin lógica duplicada en JavaScript.
 *
 * [data-mm-open="id"]: abre el <details id="id"> del acordeón y lo lleva a la vista.
 */
import { StandardEvents } from '@shopify/events';

class MmVariantSync extends HTMLElement {
  connectedCallback() {
    this.section = this.closest('.shopify-section, dialog');
    this.section?.addEventListener(StandardEvents.productSelect, this.onSelect);
  }

  disconnectedCallback() {
    this.section?.removeEventListener(StandardEvents.productSelect, this.onSelect);
  }

  onSelect = (event) => {
    if (!(event.target instanceof Element) || event.target.closest('product-card')) return;
    event.promise
      ?.then(({ detail }) => {
        const html = detail?.html;
        if (!html) return;
        const fresh = html.querySelector(`mm-variant-sync[data-mm-sync="${this.dataset.mmSync}"]`);
        if (fresh) this.innerHTML = fresh.innerHTML;
      })
      .catch(() => {});
  };
}

if (!customElements.get('mm-variant-sync')) customElements.define('mm-variant-sync', MmVariantSync);

document.addEventListener('click', (event) => {
  const opener = event.target instanceof Element ? event.target.closest('[data-mm-open]') : null;
  if (!opener) return;
  const target = document.getElementById(opener.getAttribute('data-mm-open'));
  if (!(target instanceof HTMLDetailsElement)) return;
  event.preventDefault();
  target.open = true;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
