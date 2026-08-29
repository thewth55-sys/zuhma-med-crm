"use client";

// ============================================================
// NavOrderEditor — Settings → Tu perfil. Lets each user drag-reorder
// their own sidebar nav (src/lib/nav-items.ts is the shared source of
// truth for the item list, also consumed by sidebar.tsx). A
// per-person preference, not an account setting — see
// 048_profile_nav_order.sql.
// ============================================================

import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ListOrdered, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { navItems, applyNavOrder, type NavItem } from "@/lib/nav-items";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function NavOrderEditor() {
  const t = useTranslations("Settings.profile");
  const tNav = useTranslations("Sidebar");
  const { user, profile, refreshProfile } = useAuth();
  const supabase = createClient();

  const [items, setItems] = useState<NavItem[]>(navItems);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(applyNavOrder(navItems, profile?.nav_order));
  }, [profile?.nav_order]);

  // Both sensors so the drag handle is reliable on mouse (PointerSensor,
  // 5px move to activate — avoids swallowing plain clicks) and on
  // touch (TouchSensor, a short press-hold instead of a distance
  // threshold — a finger drifts more than 5px just resting on glass,
  // so a distance constraint alone makes touch drag flaky).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const isDefaultOrder = items.every((item, i) => item.href === navItems[i]?.href);

  function handleReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.href === active.id);
    const newIndex = items.findIndex((i) => i.href === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setItems(arrayMove(items, oldIndex, newIndex));
  }

  async function persist(order: string[] | null) {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ nav_order: order })
        .eq("user_id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success(t("navOrderSaved"));
    } catch (err) {
      console.error("Save nav order error:", err);
      toast.error(t("navOrderSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <ListOrdered className="size-4 text-primary" />
          {t("navOrderTitle")}
        </CardTitle>
        <CardDescription className="text-muted-foreground">{t("navOrderDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
          <SortableContext items={items.map((i) => i.href)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {items.map((item) => (
                <SortableNavRow key={item.href} item={item} label={tNav(item.labelKey)} dragLabel={t("navOrderDrag")} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            onClick={() => persist(items.map((i) => i.href))}
            disabled={saving}
            className="bg-primary text-xs text-primary-foreground hover:bg-primary/90"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t("navOrderSave")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setItems(navItems);
              void persist(null);
            }}
            disabled={saving || isDefaultOrder}
            className="text-xs"
          >
            <RotateCcw className="size-3.5" />
            {t("navOrderReset")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableNavRow({ item, label, dragLabel }: { item: NavItem; label: string; dragLabel: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.href,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={dragLabel}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <item.icon className="size-4 text-muted-foreground" />
      <span className="text-sm text-foreground">{label}</span>
    </div>
  );
}
