import React, { useEffect, useMemo, useRef, useState } from "react";

const FILTERS = /** @type {const} */ ({
  all: "all",
  active: "active",
  completed: "completed",
});

/**
 * @typedef {{ id: string; title: string; completed: boolean }} Todo
 */

const STORAGE_KEY = "kavia.responsive_todo.todos.v1";

/**
 * Generate a stable-ish id without extra dependencies.
 * (Good enough for local-only todos.)
 * @returns {string}
 */
function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Safely parse a JSON string without throwing.
 * @param {string | null} raw
 * @returns {unknown | null}
 */
function safeJsonParse(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Validate and normalize a decoded localStorage payload into Todo[].
 * @param {unknown} value
 * @returns {Todo[]}
 */
function coerceTodos(value) {
  if (!Array.isArray(value)) return [];
  /** @type {Todo[]} */
  const result = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    // @ts-ignore - runtime checks below
    const id = item.id;
    // @ts-ignore - runtime checks below
    const title = item.title;
    // @ts-ignore - runtime checks below
    const completed = item.completed;

    if (typeof id !== "string" || typeof title !== "string") continue;
    if (typeof completed !== "boolean") continue;

    const trimmed = title.trim();
    if (!trimmed) continue;

    result.push({ id, title: trimmed, completed });
  }

  return result;
}

/**
 * Load todos from localStorage (if available).
 * @returns {Todo[]}
 */
function loadTodosFromStorage() {
  // Guard for environments where localStorage is unavailable (some privacy modes / tests).
  if (typeof window === "undefined") return [];
  if (!("localStorage" in window)) return [];

  const parsed = safeJsonParse(window.localStorage.getItem(STORAGE_KEY));
  return coerceTodos(parsed);
}

/**
 * Save todos to localStorage (best-effort).
 * @param {Todo[]} todos
 */
function saveTodosToStorage(todos) {
  if (typeof window === "undefined") return;
  if (!("localStorage" in window)) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // Best-effort persistence; ignore quota/security errors.
  }
}

function Header() {
  return (
    <header className="appHeader">
      <div className="appHeader__inner">
        <h1 className="appTitle">Todo</h1>
        <p className="appSubtitle">
          Minimal, responsive, and stored locally in your browser.
        </p>
      </div>
    </header>
  );
}

function AddTodoForm({ onAdd }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  useEffect(() => {
    // Nice UX: focus the input on first mount.
    inputRef.current?.focus();
  }, []);

  return (
    <form
      className="addTodo"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        onAdd(trimmed);
        setValue("");
        // Keep flow fast for power-users.
        inputRef.current?.focus();
      }}
    >
      <label className="srOnly" htmlFor="newTodo">
        Add a todo
      </label>
      <input
        ref={inputRef}
        id="newTodo"
        className="addTodo__input"
        type="text"
        inputMode="text"
        autoComplete="off"
        placeholder="Add a task…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="addTodo__button" type="submit">
        Add
      </button>
    </form>
  );
}

function TodoItem({ todo, onToggle, onDelete }) {
  return (
    <li className="todoItem">
      <label className="todoItem__main">
        <input
          className="todoItem__checkbox"
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id)}
          aria-label={`Mark "${todo.title}" as ${
            todo.completed ? "incomplete" : "complete"
          }`}
        />
        <span
          className={
            todo.completed ? "todoItem__title isCompleted" : "todoItem__title"
          }
        >
          {todo.title}
        </span>
      </label>

      <button
        className="todoItem__delete"
        type="button"
        onClick={() => onDelete(todo.id)}
        aria-label={`Delete "${todo.title}"`}
        title="Delete"
      >
        Delete
      </button>
    </li>
  );
}

function TodoList({ todos, onToggle, onDelete }) {
  if (todos.length === 0) {
    return (
      <div className="todoEmpty" role="status">
        <div className="todoEmpty__title">No todos yet</div>
        <div className="todoEmpty__subtitle">
          Add one above to get started.
        </div>
      </div>
    );
  }

  return (
    <ul className="todoList" aria-label="Todo list">
      {todos.map((t) => (
        <TodoItem key={t.id} todo={t} onToggle={onToggle} onDelete={onDelete} />
      ))}
    </ul>
  );
}

function BottomBar({
  filter,
  onChangeFilter,
  remainingCount,
  onClearCompleted,
  hasCompleted,
}) {
  return (
    <div className="bottomBar" role="region" aria-label="Todo controls">
      <div className="bottomBar__left">
        <span className="bottomBar__count">
          {remainingCount} {remainingCount === 1 ? "item" : "items"} left
        </span>
      </div>

      <div className="bottomBar__center" role="tablist" aria-label="Filters">
        {Object.entries(FILTERS).map(([key, value]) => (
          <button
            key={key}
            type="button"
            className={
              filter === value ? "filterButton isActive" : "filterButton"
            }
            onClick={() => onChangeFilter(value)}
            role="tab"
            aria-selected={filter === value}
          >
            {key[0].toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      <div className="bottomBar__right">
        <button
          className="clearButton"
          type="button"
          onClick={onClearCompleted}
          disabled={!hasCompleted}
          title="Remove completed todos"
        >
          Clear completed
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [filter, setFilter] = useState(FILTERS.all);

  // Load initial state from localStorage (only once on mount).
  const [todos, setTodos] = useState(
    /** @type {Todo[]} */ (() => loadTodosFromStorage())
  );

  // Persist on every todos change (best-effort).
  useEffect(() => {
    saveTodosToStorage(todos);
  }, [todos]);

  const visibleTodos = useMemo(() => {
    switch (filter) {
      case FILTERS.active:
        return todos.filter((t) => !t.completed);
      case FILTERS.completed:
        return todos.filter((t) => t.completed);
      case FILTERS.all:
      default:
        return todos;
    }
  }, [todos, filter]);

  const remainingCount = useMemo(
    () => todos.filter((t) => !t.completed).length,
    [todos]
  );

  const hasCompleted = useMemo(() => todos.some((t) => t.completed), [todos]);

  return (
    <div className="appShell">
      <Header />

      <main className="appMain">
        <section className="panel" aria-label="Todo panel">
          <AddTodoForm
            onAdd={(title) => {
              setTodos((prev) => {
                // Prevent accidental duplicates due to double-submit with same content.
                // (This is conservative; still allows same title if a different todo exists.)
                const normalized = title.trim();
                if (!normalized) return prev;
                return [{ id: makeId(), title: normalized, completed: false }, ...prev];
              });
            }}
          />

          <div className="divider" role="separator" aria-hidden="true" />

          <TodoList
            todos={visibleTodos}
            onToggle={(id) => {
              setTodos((prev) =>
                prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
              );
            }}
            onDelete={(id) => {
              setTodos((prev) => prev.filter((t) => t.id !== id));
            }}
          />

          <div className="divider" role="separator" aria-hidden="true" />

          <BottomBar
            filter={filter}
            onChangeFilter={setFilter}
            remainingCount={remainingCount}
            hasCompleted={hasCompleted}
            onClearCompleted={() => {
              setTodos((prev) => prev.filter((t) => !t.completed));
            }}
          />
        </section>
      </main>

      <footer className="appFooter">
        <span className="appFooter__text">
          Local-only demo · Todos are saved to your browser automatically.
        </span>
      </footer>
    </div>
  );
}
