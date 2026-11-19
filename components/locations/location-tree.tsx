"use client";

import Link from "next/link";
import { ChevronRight, MapPin, MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LocationNode } from "@/lib/locations/types";
import { Button } from "@/components/ui/buttons";
import { expandedStore, toggleExpanded } from "./expanded-store";
import { useLocationActions } from "./location-dialogs";
import { useCurrentLocation, useLocations } from "./locations-context";

export function LocationTree() {
  const t = useTranslations("locations");
  const { childrenOf } = useLocations();
  const { openCreate } = useLocationActions();
  const roots = childrenOf(null);

  return (
    <div className="flex flex-col gap-4">
      <Button variant="primary" onClick={() => openCreate(null)} className="self-start">
        <Plus className="size-5" aria-hidden />
        {t("add")}
      </Button>
      {roots.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted">{t("empty")}</p>
      ) : (
        <ul role="tree" aria-label={t("title")} className="-mx-2 flex flex-col">
          {roots.map((node) => (
            <TreeNode key={node.id} node={node} depth={0} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TreeNode({ node, depth }: { node: LocationNode; depth: number }) {
  const t = useTranslations("locations");
  const tCommon = useTranslations("common");
  const tHere = useTranslations("here");
  const { childrenOf, name } = useLocations();
  const { openMenu } = useLocationActions();
  const expanded = expandedStore.useValue().includes(node.id);
  const current = useCurrentLocation();
  const children = childrenOf(node.id);
  const hasChildren = children.length > 0;
  const label = name(node);

  return (
    <li role="treeitem" aria-expanded={hasChildren ? expanded : undefined} aria-selected={false}>
      <div className="flex items-center" style={{ paddingLeft: `${Math.min(depth, 6) * 1}rem` }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggleExpanded(node.id)}
            aria-label={expanded ? t("collapse", { name: label }) : t("expand", { name: label })}
            className="flex size-11 shrink-0 items-center justify-center text-muted"
          >
            <ChevronRight className={`size-5 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />
          </button>
        ) : (
          <span className="size-11 shrink-0" aria-hidden />
        )}
        <Link
          href={`/locations/${node.id}`}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl pr-1 active:bg-surface"
        >
          <span className="truncate">{label}</span>
          {current?.id === node.id && (
            <MapPin className="size-4 shrink-0 text-accent" aria-label={tHere("youAreHere")} />
          )}
        </Link>
        <span className="shrink-0 px-1 text-sm text-muted tabular-nums">{t("itemsCount", { count: node.totalItems })}</span>
        <button
          type="button"
          onClick={() => openMenu(node.id)}
          aria-label={`${tCommon("moreActions")}: ${label}`}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted"
        >
          <MoreHorizontal className="size-5" aria-hidden />
        </button>
      </div>
      {hasChildren && expanded && (
        <ul role="group" className="flex flex-col">
          {children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
