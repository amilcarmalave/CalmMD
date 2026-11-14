/**
 * Stand-in for elkjs (EPL-2.0 OR GPL-3.0), which Mermaid loads only for the opt-in `layout: elk` mode.
 * It's excluded to keep CalmMD's dependencies permissively licensed (and 1.4 MB lighter). Diagrams
 * asking for ELK show this message, and every other layout works as usual.
 */
export default class ELK {
  constructor() {
    throw new Error('The ELK layout isn’t available in CalmMD. Remove “layout: elk” to use the default layout.');
  }
}
