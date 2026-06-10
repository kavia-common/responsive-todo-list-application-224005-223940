import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const STORAGE_KEY = "kavia.responsive_todo.todos.v1";

/**
 * Helper to add a todo through the UI.
 * @param {ReturnType<typeof userEvent.setup>} user
 * @param {string} title
 */
async function addTodo(user, title) {
  const input = screen.getByLabelText(/add a todo/i);
  await user.clear(input);
  await user.type(input, title);
  await user.click(screen.getByRole("button", { name: /add/i }));
}

/**
 * Helper to get the Todo list container.
 * (If empty, the list is replaced with the "No todos yet" panel.)
 */
function getTodoList() {
  return screen.getByRole("list", { name: /todo list/i });
}

beforeEach(() => {
  // Ensure tests do not leak persisted state between runs.
  window.localStorage.clear();
});

describe("Todo app core behaviors", () => {
  test("adds a todo, trims whitespace, and clears the input", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Starts empty
    expect(screen.getByText(/no todos yet/i)).toBeInTheDocument();

    await addTodo(user, "   Buy milk   ");

    // Item appears in list (title text is trimmed)
    expect(screen.getByText("Buy milk")).toBeInTheDocument();

    // Input cleared after submit
    expect(screen.getByLabelText(/add a todo/i)).toHaveValue("");

    // Remaining count updates
    expect(screen.getByText(/1 item left/i)).toBeInTheDocument();
  });

  test("does not add an empty/whitespace-only todo", async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTodo(user, "   ");

    // Still empty state
    expect(screen.getByText(/no todos yet/i)).toBeInTheDocument();

    // No persistence written for empty add (still null)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("toggles a todo complete/incomplete via checkbox and updates counts", async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTodo(user, "Walk dog");

    // Find the checkbox using its aria-label that includes the title
    const markComplete = screen.getByRole("checkbox", {
      name: /mark "walk dog" as complete/i,
    });
    expect(markComplete).not.toBeChecked();

    await user.click(markComplete);

    // Checkbox should now be checked; aria-label should reflect new action
    expect(
      screen.getByRole("checkbox", {
        name: /mark "walk dog" as incomplete/i,
      })
    ).toBeChecked();

    // Remaining count should be 0
    expect(screen.getByText(/0 items left/i)).toBeInTheDocument();

    // Toggle back
    await user.click(
      screen.getByRole("checkbox", {
        name: /mark "walk dog" as incomplete/i,
      })
    );

    expect(
      screen.getByRole("checkbox", {
        name: /mark "walk dog" as complete/i,
      })
    ).not.toBeChecked();
    expect(screen.getByText(/1 item left/i)).toBeInTheDocument();
  });

  test("deletes a todo", async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTodo(user, "Task A");
    await addTodo(user, "Task B");

    // There should be two items in the list
    const list = getTodoList();
    expect(within(list).getByText("Task A")).toBeInTheDocument();
    expect(within(list).getByText("Task B")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /delete "task a"/i })
    );

    expect(screen.queryByText("Task A")).not.toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();

    // Remaining count should be 1 (Task B still active)
    expect(screen.getByText(/1 item left/i)).toBeInTheDocument();
  });

  test("filters todos (all/active/completed)", async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTodo(user, "Active 1");
    await addTodo(user, "Active 2");
    await addTodo(user, "Done 1");

    // Mark "Done 1" as completed.
    await user.click(
      screen.getByRole("checkbox", { name: /mark "done 1" as complete/i })
    );

    // All filter shows all three
    await user.click(screen.getByRole("tab", { name: /all/i }));
    expect(screen.getByText("Active 1")).toBeInTheDocument();
    expect(screen.getByText("Active 2")).toBeInTheDocument();
    expect(screen.getByText("Done 1")).toBeInTheDocument();

    // Active shows only active
    await user.click(screen.getByRole("tab", { name: /active/i }));
    expect(screen.getByText("Active 1")).toBeInTheDocument();
    expect(screen.getByText("Active 2")).toBeInTheDocument();
    expect(screen.queryByText("Done 1")).not.toBeInTheDocument();

    // Completed shows only completed
    await user.click(screen.getByRole("tab", { name: /completed/i }));
    expect(screen.queryByText("Active 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Active 2")).not.toBeInTheDocument();
    expect(screen.getByText("Done 1")).toBeInTheDocument();
  });

  test("clear completed removes completed todos and is disabled when none are completed", async () => {
    const user = userEvent.setup();
    render(<App />);

    const clearBtn = screen.getByRole("button", { name: /clear completed/i });
    expect(clearBtn).toBeDisabled();

    await addTodo(user, "A");
    await addTodo(user, "B");

    // Mark A complete
    await user.click(
      screen.getByRole("checkbox", { name: /mark "a" as complete/i })
    );

    // Button enabled when at least one is completed
    expect(clearBtn).toBeEnabled();

    await user.click(clearBtn);

    // Completed item removed, remaining active item stays
    expect(screen.queryByText("A")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();

    // No completed remaining -> disabled again
    expect(clearBtn).toBeDisabled();
  });

  test("persists todos to localStorage and loads them on next mount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await addTodo(user, "Persist me");

    // Should have written localStorage with the new todo
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some((t) => t && t.title === "Persist me")).toBe(true);

    // Unmount and re-mount to simulate a fresh load
    unmount();
    render(<App />);

    expect(screen.getByText("Persist me")).toBeInTheDocument();
  });

  test("ignores invalid localStorage payloads (robust load)", () => {
    // Seed invalid payload: wrong types / empty titles / not-an-array
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 1, title: "Bad id type", completed: false },
        { id: "ok", title: "   ", completed: false },
        { id: "ok2", title: "Good", completed: true },
        { id: "ok3", title: "Also good", completed: false },
        { id: "ok4", title: "Bad completed type", completed: "nope" },
      ])
    );

    render(<App />);

    // Only valid, non-empty trimmed items should appear
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText("Also good")).toBeInTheDocument();

    expect(screen.queryByText(/bad id type/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bad completed type/i)).not.toBeInTheDocument();
  });
});
