import { Prec, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { matches, parseBinding } from '../core/keys';

export interface Command {
  id: string;
  title: string;
  /** Palette group, shown as a prefix ("Format: Bold"). */
  category: string;
  /** Shortcut, as in "Mod+Shift+P". */
  keys?: string;
  /**
   * 'editor' commands are bound in CodeMirror's keymap and only fire while the editor has focus.
   * 'global' commands fire from anywhere in the window.
   */
  scope?: 'global' | 'editor';
  /** Hidden from the palette and the shortcut is inactive when this returns false. */
  when?: () => boolean;
  run: () => unknown;
  /** Set to false for commands that only make sense from a shortcut or menu. */
  palette?: boolean;
}

/**
 * The one list of everything the app can do. The palette, keyboard shortcuts, toolbar,
 * selection bubble and context menus all go through it, so a feature is defined once.
 */
export class CommandRegistry {
  private cmds = new Map<string, Command>();
  private recent: string[] = [];

  register(list: Command[]) {
    for (const c of list) {
      if (this.cmds.has(c.id)) throw new Error(`Duplicate command id ${c.id}`);
      if (c.keys) parseBinding(c.keys); // validate early
      this.cmds.set(c.id, c);
    }
  }

  /** Replaces every command whose id starts with `prefix` (for dynamic lists like user themes). */
  replace(prefix: string, list: Command[]) {
    for (const id of [...this.cmds.keys()]) if (id.startsWith(prefix)) this.cmds.delete(id);
    this.register(list);
  }

  get(id: string) {
    return this.cmds.get(id);
  }

  all(): Command[] {
    return [...this.cmds.values()];
  }

  isAvailable(c: Command) {
    return !c.when || c.when();
  }

  /** Commands for the palette, most recently used first. */
  forPalette(): Command[] {
    const list = this.all().filter((c) => c.palette !== false && this.isAvailable(c));
    const rank = (c: Command) => {
      const i = this.recent.indexOf(c.id);
      return i === -1 ? Infinity : i;
    };
    return list.sort((a, b) => rank(a) - rank(b));
  }

  run(id: string): boolean {
    const c = this.cmds.get(id);
    if (!c || !this.isAvailable(c)) return false;
    this.recent = [id, ...this.recent.filter((x) => x !== id)].slice(0, 20);
    void c.run();
    return true;
  }

  recents() {
    return [...this.recent];
  }

  /** Window-level shortcuts. Returns true if a command handled the event. */
  handleKey(e: KeyboardEvent, isMac: boolean): boolean {
    for (const c of this.cmds.values()) {
      if (!c.keys || (c.scope ?? 'global') !== 'global') continue;
      if (matches(parseBinding(c.keys), e, isMac) && this.isAvailable(c)) {
        e.preventDefault();
        this.run(c.id);
        return true;
      }
    }
    return false;
  }

  /**
   * Editor-scoped shortcuts, ahead of CodeMirror's default keymap. The registry is consulted at
   * key time, so commands registered after the editor was built still work, and matching uses the
   * same rules as global shortcuts.
   */
  editorKeymap(isMac: boolean): Extension {
    return Prec.high(
      EditorView.domEventHandlers({
        keydown: (e) => {
          if (e.isComposing) return false;
          for (const c of this.cmds.values()) {
            if (!c.keys || c.scope !== 'editor') continue;
            if (matches(parseBinding(c.keys), e, isMac) && this.isAvailable(c)) {
              e.preventDefault();
              this.run(c.id);
              return true;
            }
          }
          return false;
        },
      }),
    );
  }
}
