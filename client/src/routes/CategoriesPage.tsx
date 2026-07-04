import { useState } from "react";
import { Pencil, Plus, Shapes, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDeleteDialog, type ForceResult } from "@/components/common/ConfirmDeleteDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { useCategories, useDeleteCategory } from "@/hooks/useCategories";
import { CategoryFormDialog } from "@/features/categories/CategoryFormDialog";
import { categoryLabel } from "@/lib/i18nLabels";
import type { Category, CategoryType } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export default function CategoriesPage() {
  const { t } = useTranslation("recurring");
  const [tab, setTab] = useState<CategoryType>("expense");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(c: Category) {
    setEditing(c);
    setDialogOpen(true);
  }

  return (
    <div>
      <PageHeader
        title={t("categoriesPage.title")}
        description={t("categoriesPage.description")}
        actions={
          <Button onClick={openNew}>
            <Plus /> {t("categoriesPage.newCategory")}
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as CategoryType)}>
        <TabsList className="mb-5">
          <TabsTrigger value="expense">{t("txnType.expense", { ns: "common" })}</TabsTrigger>
          <TabsTrigger value="income">{t("txnType.income", { ns: "common" })}</TabsTrigger>
        </TabsList>
        <TabsContent value="expense">
          <CategoryGrid type="expense" onEdit={openEdit} onAdd={openNew} />
        </TabsContent>
        <TabsContent value="income">
          <CategoryGrid type="income" onEdit={openEdit} onAdd={openNew} />
        </TabsContent>
      </Tabs>

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editing}
        defaultType={tab}
      />
    </div>
  );
}

function CategoryGrid({
  type,
  onEdit,
  onAdd,
}: {
  type: CategoryType;
  onEdit: (c: Category) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation("recurring");
  const { data: categories, isLoading } = useCategories(type);
  const del = useDeleteCategory();
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  async function confirmDelete(c: Category): Promise<void | ForceResult> {
    try {
      await del.mutateAsync({ id: c._id });
      toast.success(t("category.toast.deleted"));
    } catch (e) {
      const err = e as Error & { code?: string };
      // Category still used by transactions — escalate to the "delete anyway" step.
      if (err.code === "CATEGORY_IN_USE") return { needsForce: true, message: err.message };
      toast.error(err.message || t("category.toast.deleteFailed"));
      throw e;
    }
  }

  async function forceDelete(c: Category) {
    try {
      await del.mutateAsync({ id: c._id, force: true });
      toast.success(t("category.toast.deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("category.toast.deleteFailed"));
      throw e;
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!categories?.length) {
    return (
      <EmptyState
        icon={Shapes}
        title={t(type === "expense" ? "categoriesPage.emptyExpense" : "categoriesPage.emptyIncome")}
        description={t("categoriesPage.emptyDescription")}
        action={<Button onClick={onAdd}><Plus /> {t("categoriesPage.newCategory")}</Button>}
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => (
        <Card key={c._id} className="group">
          <CardContent className="flex items-center gap-3 p-3">
            <CategoryIcon icon={c.icon} color={c.color} size="md" />
            <span className="flex-1 truncate text-sm font-medium">{categoryLabel(c.name)}</span>
            <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(c)} aria-label={t("actions.edit", { ns: "common" })}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive"
                onClick={() => setDeleteTarget(c)}
                aria-label={t("actions.delete", { ns: "common" })}
              >
                <Trash2 />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {deleteTarget && (
        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          itemKey="category"
          confirmValue={categoryLabel(deleteTarget.name)}
          onConfirm={() => confirmDelete(deleteTarget)}
          onForceConfirm={() => forceDelete(deleteTarget)}
        />
      )}
    </div>
  );
}
