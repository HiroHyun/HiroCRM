import { beforeEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode } from "react";
import { ScreenshotField } from "./screenshot-field";
import { strings } from "../../lib/strings";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
const dropzone = vi.hoisted(() => ({ options: {} as Record<string, unknown> }));
const api = vi.hoisted(() => ({ fetch: vi.fn(), replace: vi.fn() }));

vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next;
    }];
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: api.replace }) }));
vi.mock("./client-api", () => ({ apiFetch: api.fetch }));
vi.mock("react-dropzone", () => ({
  useDropzone(options: Record<string, unknown>) {
    dropzone.options = options;
    return { getRootProps: () => ({}), getInputProps: () => ({}), isDragActive: false };
  },
}));

function removeButton(node: ReactNode): Record<string, unknown> | undefined {
  if (Array.isArray(node)) return node.map(removeButton).find(Boolean);
  if (!isValidElement<Record<string, unknown>>(node)) return;
  if (node.props["aria-label"] === strings.upload.remove) return node.props;
  return removeButton(node.props.children as ReactNode);
}

beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
  vi.clearAllMocks();
});

it("locks removal and tells the form to wait until all uploads finish", async () => {
  let finish!: (value: unknown) => void;
  api.fetch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const onChange = vi.fn();
  const onUploadingChange = vi.fn();
  const props = { value: ["/uploads/old.png"], onChange, onUploadingChange, disabled: false };
  ScreenshotField(props);
  const onDrop = dropzone.options.onDrop as (files: File[], rejected: []) => void;
  onDrop([new File(["image"], "new.png", { type: "image/png" })], []);
  expect(onUploadingChange).toHaveBeenLastCalledWith(true);
  hooks.cursor = 0;
  expect(removeButton(ScreenshotField(props))?.disabled).toBe(true);
  expect(dropzone.options.disabled).toBe(true);
  finish({ kind: "ok", data: { url: "/uploads/new.png" } });
  await vi.waitFor(() => expect(onUploadingChange).toHaveBeenLastCalledWith(false));
  expect(onChange).toHaveBeenCalledWith(["/uploads/old.png", "/uploads/new.png"]);
  hooks.cursor = 0;
  expect(removeButton(ScreenshotField(props))?.disabled).toBe(false);
});

it("disables attachment changes while the form saves", () => {
  const tree = ScreenshotField({
    value: ["/uploads/old.png"], onChange: vi.fn(),
    onUploadingChange: vi.fn(), disabled: true,
  });
  expect(removeButton(tree)?.disabled).toBe(true);
  expect(dropzone.options.disabled).toBe(true);
});

it("releases the form when authentication expires during upload", async () => {
  api.fetch.mockResolvedValue({ kind: "unauthorized" });
  const onUploadingChange = vi.fn();
  ScreenshotField({ value: [], onChange: vi.fn(), onUploadingChange, disabled: false });
  const onDrop = dropzone.options.onDrop as (files: File[], rejected: []) => void;
  onDrop([new File(["image"], "new.png")], []);
  await vi.waitFor(() => expect(onUploadingChange).toHaveBeenLastCalledWith(false));
  expect(api.replace).toHaveBeenCalledWith("/login");
});
