"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightLeft, ChevronRight, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createLocation, deleteLocation, moveLocation, renameLocation } from "@/app/(app)/locations/actions";
import { NameFields } from "@/components/name-fields";
import { Alert, Button } from "@/components/ui/buttons";
import { Sheet } from "@/components/ui/sheet";
import { useErrorText } from "@/lib/use-error-text";
import { LOCATION_NAME_MAX, locationNamesSchema, type NamePairInput } from "@/lib/validation/names";
import { useDataLang } from "@/components/data-lang/context";
import { expandAll } from "./expanded-store";
import { LocationPicker } from "./location-picker";
import { useCurrentLocation, useLocations, useSetCurrentLocation } from "./locations-context";

type Dialog =
  | { kind: "menu"; id: string }
  | { kind: "create"; parentId: string | null }
  | { kind: "rename"; id: string }
  | { kind: "move"; id: string }
  | { kind: "delete"; id: string };

type Actions = {
  openMenu: (id: string) => void;
  openCreate: (parentId: string | null) => void;
  openRename: (id: string) => void;
  openMove: (id: string) => void;
  openDelete: (id: string) => void;
  setHere: (id: string | null) => void;
};

const ActionsContext = createContext<Actions | null>(null);

export function useLocationActions() {
  const ctx = use(ActionsContext);
  if (!ctx) throw new Error("useLocationActions must be used inside LocationDialogsProvider");
  return ctx;
}

/** Hosts all place dialogs once for the (app) layout; components open them through useLocationActions(). */
export function LocationDialogsProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const close = useCallback(() => setDialog(null), []);
  const setCurrentLocationId = useSetCurrentLocation();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const actions = useMemo<Actions>(
    () => ({
      openMenu: (id) => setDialog({ kind: "menu", id }),
      openCreate: (parentId) => setDialog({ kind: "create", parentId }),
      openRename: (id) => setDialog({ kind: "rename", id }),
      openMove: (id) => setDialog({ kind: "move", id }),
      openDelete: (id) => setDialog({ kind: "delete", id }),
      setHere: (id) => setCurrentLocationId(id),
    }),
    [setCurrentLocationId],
  );

  return (
    <ActionsContext value={actions}>
      {children}
      {dialog?.kind === "menu" && <MenuSheet id={dialog.id} onClose={close} open={setDialog} />}
      {dialog?.kind === "create" && <CreateSheet parentId={dialog.parentId} onClose={close} notify={setNotice} />}
      {dialog?.kind === "rename" && <RenameSheet id={dialog.id} onClose={close} />}
      {dialog?.kind === "move" && <MoveSheet id={dialog.id} onClose={close} notify={setNotice} />}
      {dialog?.kind === "delete" && <DeleteSheet id={dialog.id} onClose={close} notify={setNotice} />}
      {notice && (
        <div
          role="status"
          className={`fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
            notice.tone === "ok" ? "bg-foreground text-background" : "bg-red-600 text-white"
          }`}
        >
          {notice.text}
        </div>
      )}
    </ActionsContext>
  );
}

type Notify = (n: { text: string; tone: "ok" | "error" }) => void;

// --- Menu ---------------------------------------------------------------------

function MenuSheet({ id, onClose, open }: { id: string; onClose: () => void; open: (d: Dialog) => void }) {
  const t = useTranslations("locations");
  const tHere = useTranslations("here");
  const tCommon = useTranslations("common");
  const { byId, path } = useLocations();
  const current = useCurrentLocation();
  const setCurrentLocationId = useSetCurrentLocation();
  const loc = byId.get(id);
  if (!loc) return null;
  const isHere = current?.id === id;

  const items = [
    {
      icon: MapPin,
      label: isHere ? tHere("youAreHere") : tHere("setHere"),
      disabled: isHere,
      onClick: () => {
        setCurrentLocationId(id);
        onClose();
      },
    },
    { icon: Plus, label: t("addInside"), onClick: () => open({ kind: "create", parentId: id }) },
    { icon: Pencil, label: t("rename"), onClick: () => open({ kind: "rename", id }) },
    { icon: ArrowRightLeft, label: t("move"), onClick: () => open({ kind: "move", id }) },
    { icon: Trash2, label: tCommon("delete"), danger: true, onClick: () => open({ kind: "delete", id }) },
  ];

  return (
    <Sheet open onClose={onClose} title={path(loc)}>
      <ul className="-mx-2 flex flex-col">
        {items.map(({ icon: Icon, label, onClick, danger, disabled }) => (
          <li key={label}>
            <button
              type="button"
              onClick={onClick}
              disabled={disabled}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left active:bg-surface disabled:opacity-60 ${
                danger ? "text-red-600 dark:text-red-400" : ""
              }`}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="flex-1">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

// --- Create -------------------------------------------------------------------

function CreateSheet({ parentId, onClose, notify }: { parentId: string | null; onClose: () => void; notify: Notify }) {
  const t = useTranslations("locations");
  const tCommon = useTranslations("common");
  const errorText = useErrorText();
  const { byId, path } = useLocations();
  const { mode } = useDataLang();
  const [parent, setParent] = useState<string | null>(parentId);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  const form = useForm<NamePairInput>({
    resolver: zodResolver(locationNamesSchema(mode)),
    defaultValues: { name_ru: "", name_en: "" },
  });
  const parentNode = parent ? byId.get(parent) : undefined;

  const submit = form.handleSubmit(async (names) => {
    setError(undefined);
    const result = await createLocation({ ...names, parent_id: parent });
    if (!result.ok) return setError(result.error);
    if (parentNode) expandAll(parentNode.idPath);
    notify({ text: t("created"), tone: "ok" });
    onClose();
  });

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={t("createTitle")}
        footer={
          <div className="flex gap-2">
            <Button onClick={onClose} className="flex-1">
              {tCommon("cancel")}
            </Button>
            <Button variant="primary" type="submit" form="location-create" pending={form.formState.isSubmitting} className="flex-1">
              {tCommon("save")}
            </Button>
          </div>
        }
      >
        <form id="location-create" onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error && <Alert>{errorText(error)}</Alert>}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("parent")}</span>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-border bg-surface px-4 text-left"
            >
              <span className="min-w-0 flex-1 truncate">
                {parentNode ? path(parentNode) : `${t("topLevel")} (${t("topLevelHint")})`}
              </span>
              <ChevronRight className="size-5 text-muted" aria-hidden />
            </button>
          </div>
          <NameFields form={form} max={LOCATION_NAME_MAX} />
        </form>
      </Sheet>
      <LocationPicker
        open={picking}
        onClose={() => setPicking(false)}
        initialId={parent}
        allowRoot
        title={t("parent")}
        onSelect={(id) => {
          setParent(id);
          setPicking(false);
        }}
      />
    </>
  );
}

// --- Rename -------------------------------------------------------------------

function RenameSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("locations");
  const tCommon = useTranslations("common");
  const errorText = useErrorText();
  const { byId } = useLocations();
  const { mode } = useDataLang();
  const loc = byId.get(id);
  const [error, setError] = useState<string>();
  const form = useForm<NamePairInput>({
    resolver: zodResolver(locationNamesSchema(mode)),
    defaultValues: { name_ru: loc?.nameRu ?? "", name_en: loc?.nameEn ?? "" },
  });
  if (!loc) return null;

  const submit = form.handleSubmit(async (names) => {
    setError(undefined);
    const result = await renameLocation({ ...names, id });
    if (!result.ok) return setError(result.error);
    onClose();
  });

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("renameTitle")}
      footer={
        <div className="flex gap-2">
          <Button onClick={onClose} className="flex-1">
            {tCommon("cancel")}
          </Button>
          <Button variant="primary" type="submit" form="location-rename" pending={form.formState.isSubmitting} className="flex-1">
            {tCommon("save")}
          </Button>
        </div>
      }
    >
      <form id="location-rename" onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && <Alert>{errorText(error)}</Alert>}
        <NameFields form={form} max={LOCATION_NAME_MAX} />
      </form>
    </Sheet>
  );
}

// --- Move ---------------------------------------------------------------------

function MoveSheet({ id, onClose, notify }: { id: string; onClose: () => void; notify: Notify }) {
  const t = useTranslations("locations");
  const errorText = useErrorText();
  const { byId, name } = useLocations();
  const [, startTransition] = useTransition();
  const loc = byId.get(id);
  if (!loc) return null;

  return (
    <LocationPicker
      open
      onClose={onClose}
      title={t("moveTitle", { name: name(loc) })}
      initialId={loc.parentId}
      excludeId={id}
      allowRoot
      onSelect={(parentId) => {
        onClose();
        if (parentId === loc.parentId) return;
        startTransition(async () => {
          const result = await moveLocation({ id, parent_id: parentId });
          if (!result.ok) return notify({ text: errorText(result.error)!, tone: "error" });
          const parent = parentId ? byId.get(parentId) : undefined;
          if (parent) expandAll(parent.idPath);
          notify({ text: t("moved"), tone: "ok" });
        });
      }}
    />
  );
}

// --- Delete -------------------------------------------------------------------

function DeleteSheet({ id, onClose, notify }: { id: string; onClose: () => void; notify: Notify }) {
  const t = useTranslations("locations");
  const tCommon = useTranslations("common");
  const errorText = useErrorText();
  const router = useRouter();
  const pathname = usePathname();
  const { byId, childrenOf, name, here } = useLocations();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const loc = byId.get(id);
  if (!loc) return null;

  const places = childrenOf(id).length;
  const items = loc.directItems;
  const blocked = places > 0 || items > 0;

  const confirm = () =>
    startTransition(async () => {
      setError(undefined);
      const result = await deleteLocation({ id });
      if (!result.ok) return setError(result.error);
      if (here.get() === id) here.set(null); // the place itself is gone: "I'm here" is reset
      if (pathname === `/locations/${id}`) router.replace(loc.parentId ? `/locations/${loc.parentId}` : "/locations");
      notify({ text: t("deleted"), tone: "ok" });
      onClose();
    });

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("deleteTitle", { name: name(loc) })}
      footer={
        <div className="flex gap-2">
          <Button onClick={onClose} className="flex-1">
            {tCommon("cancel")}
          </Button>
          <Button variant="danger" onClick={confirm} disabled={blocked} pending={pending} className="flex-1">
            {tCommon("delete")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert>{errorText(error)}</Alert>}
        {blocked ? (
          <Alert tone="warning">{t("deleteBlocked", { places, items, both: places > 0 && items > 0 ? "yes" : "no" })}</Alert>
        ) : (
          <p className="text-muted">{t("deleteConfirm")}</p>
        )}
      </div>
    </Sheet>
  );
}
