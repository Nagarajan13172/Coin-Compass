import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AmountInput } from "@/components/common/AmountInput";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { PersonPicker } from "@/features/people/PersonPicker";
import { usePersonGroups } from "@/hooks/usePersonGroups";
import type { PersonGroup } from "@/lib/types";
import { rebalancedShares, remainingToAllocate } from "@/lib/splits";

/** A participant while being edited. `id` only exists to key the rows stably —
 *  names can repeat or be blank mid-typing, so they can't be keys. */
export interface ParticipantDraft {
  id: string;
  person: string;
  /** Set when picked from the People list; null means find-or-create by name. */
  personId: string | null;
  amount: number;
}

let seq = 0;
export function newParticipant(person = "", amount = 0): ParticipantDraft {
  seq += 1;
  return { id: `p${seq}`, person, personId: null, amount };
}

interface Props {
  /** The full bill — comes from the sheet's amount keypad. */
  total: number;
  yourShare: number;
  onYourShareChange: (n: number) => void;
  participants: ParticipantDraft[];
  onParticipantsChange: (p: ParticipantDraft[]) => void;
}

/**
 * Divide a bill you paid among the people who shared it.
 *
 * Shares default to an even split and re-balance as people are added or the
 * total changes — until the moment a share is typed by hand, after which the
 * numbers are left exactly as entered (an "equal" button re-arms it). The
 * running remainder is always on screen: a split can only be saved once the
 * shares add up, so the user watches the gap close instead of hitting an error.
 */
export function SplitEditor({
  total,
  yourShare,
  onYourShareChange,
  participants,
  onParticipantsChange,
}: Props) {
  const { t } = useTranslation("splits");
  const { data: groups } = usePersonGroups();

  // Off the moment a share is typed by hand, so manual amounts are never
  // silently overwritten by a re-balance.
  const autoEqual = useRef(true);

  const remaining = remainingToAllocate(total, yourShare, participants.map((p) => p.amount));
  const balanced = remaining === 0 && total > 0;

  function applyEqualSplit(rows: ParticipantDraft[] = participants) {
    const next = rebalancedShares(total, rows.length);
    if (!next) return; // nobody to split with — never write the list back empty
    onYourShareChange(next.yourShare);
    onParticipantsChange(rows.map((p, i) => ({ ...p, amount: next.shares[i] })));
  }

  // Re-balance while the split is still "equal": the total changes as the user
  // types the bill, and people get added one at a time. rebalancedShares decides
  // when writing is safe — see its note on the mount-order race it guards.
  useEffect(() => {
    if (autoEqual.current) applyEqualSplit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, participants.length]);

  /**
   * Drop a group's members in as participants, skipping anyone already listed
   * and any blank row they can fill. Amounts are left to the auto-equal pass,
   * which re-runs on the new headcount.
   */
  function addGroup(group: PersonGroup) {
    const already = new Set(participants.map((p) => p.personId).filter(Boolean));
    const additions = group.members
      .filter((m) => !already.has(m._id))
      .map((m) => ({ ...newParticipant(m.name), personId: m._id }));
    if (!additions.length) return;
    // Reuse the trailing empty row rather than leaving it stranded above them.
    const kept = participants.filter((p) => p.person.trim() || p.personId);
    onParticipantsChange([...kept, ...additions]);
  }

  function updateParticipant(id: string, patch: Partial<ParticipantDraft>) {
    if (patch.amount !== undefined) autoEqual.current = false;
    onParticipantsChange(participants.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  const headcount = participants.length + 1;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="h-4 w-4 text-muted-foreground" />
          {t("editor.sharedBetween", { count: headcount })}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            autoEqual.current = true;
            applyEqualSplit();
          }}
          disabled={!(total > 0)}
        >
          {t("editor.splitEqually")}
        </Button>
      </div>

      {/* Your own share — the ONLY part of this bill that becomes an expense. */}
      <div className="space-y-1.5">
        <Label htmlFor="split-your-share">{t("editor.yourShare")}</Label>
        <AmountInput
          id="split-your-share"
          value={yourShare ? String(yourShare) : ""}
          onChange={(v) => {
            autoEqual.current = false;
            onYourShareChange(Number(v) || 0);
          }}
          placeholder="0"
        />
        <p className="text-xs text-muted-foreground">{t("editor.yourShareHelp")}</p>
      </div>

      {/* Everyone else — each becomes an IOU on the Credits page. */}
      <div className="space-y-2">
        <Label>{t("editor.othersLabel")}</Label>
        {participants.map((p, i) => (
          <div key={p.id} className="flex items-start gap-2">
            <PersonPicker
              className="flex-1"
              value={{ name: p.person, personId: p.personId }}
              onChange={(v) => updateParticipant(p.id, { person: v.name, personId: v.personId })}
              placeholder={t("editor.personPlaceholder", { n: i + 1 })}
              aria-label={t("editor.personAria", { n: i + 1 })}
            />
            <AmountInput
              className="w-28"
              value={p.amount ? String(p.amount) : ""}
              onChange={(v) => updateParticipant(p.id, { amount: Number(v) || 0 })}
              placeholder="0"
              aria-label={t("editor.shareAria", { n: i + 1 })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onParticipantsChange(participants.filter((x) => x.id !== p.id))}
              aria-label={t("editor.removePerson", { name: p.person || String(i + 1) })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onParticipantsChange([...participants, newParticipant()])}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t("editor.addPerson")}
          </Button>
          {/* One tap adds a whole regular group; anyone extra who came along is
              still added individually with the button beside it. */}
          {(groups?.length ?? 0) > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="flex-1">
                  <Users className="mr-1.5 h-4 w-4" />
                  {t("editor.addGroup")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {groups?.map((g) => (
                  <DropdownMenuItem key={g._id} onClick={() => addGroup(g)}>
                    {g.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("editor.groupSize", { count: g.members.length })}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* The running remainder: the split can't be saved until this reads zero. */}
      <div
        className={cn(
          "flex items-center justify-between rounded-md px-3 py-2 text-sm",
          balanced ? "bg-income/10 text-income" : "bg-muted text-muted-foreground"
        )}
        role="status"
      >
        <span>{balanced ? t("editor.balanced") : t("editor.remaining")}</span>
        <span className="font-semibold tabular-nums">
          {balanced ? formatMoney(total) : formatMoney(remaining)}
        </span>
      </div>
      {!balanced && total > 0 && (
        <p className="text-xs text-muted-foreground">
          {remaining > 0 ? t("editor.remainingHelp") : t("editor.overAllocatedHelp")}
        </p>
      )}
    </div>
  );
}
