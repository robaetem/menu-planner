"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Beef, Carrot, CookingPot, Plus, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Diner, Groente, Vleesje } from "@/lib/types";
import type { Portion } from "@/lib/freezer/potjes";
import type { FreezerTab } from "@/lib/freezer/inventory";
import { PotjesView } from "../potjes/potjes-view";
import { VleesjesView } from "../vleesjes/vleesjes-view";
import { GroentenView } from "./groenten-view";

const NEW_LABEL: Record<FreezerTab, string> = {
  potjes: "Nieuw potje",
  vleesjes: "Nieuw vleesje",
  groenten: "Nieuwe groente",
};

export function DiepvriesView({
  initialTab,
  portions,
  today,
  diners,
  potjeNames,
  vleesjes,
  vleesjeNames,
  groenten,
  groenteNames,
}: {
  initialTab: FreezerTab;
  portions: Portion[];
  today: string;
  diners: Diner[];
  potjeNames: string[];
  vleesjes: Vleesje[];
  vleesjeNames: string[];
  groenten: Groente[];
  groenteNames: string[];
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<FreezerTab>(initialTab);
  // Which tab's "new" dialog is open.
  const [adding, setAdding] = React.useState<FreezerTab | null>(null);
  const addingProps = (t: FreezerTab) => ({
    adding: adding === t,
    onAddingChange: (open: boolean) => setAdding(open ? t : null),
  });

  React.useEffect(() => setTab(initialTab), [initialTab]);

  function changeTab(next: string | number) {
    const value = String(next) as FreezerTab;
    setTab(value);
    router.replace(`/diepvries?tab=${value}`, { scroll: false });
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
          <Snowflake className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Diepvries</h1>
      </div>

      <Tabs value={tab} onValueChange={changeTab} className="mt-6 gap-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="Diepvriescategorieën" className="h-10 w-full sm:w-fit">
            <TabsTrigger value="potjes" className="px-3 sm:min-w-28">
              <CookingPot className="size-4" /> Potjes
            </TabsTrigger>
            <TabsTrigger value="vleesjes" className="px-3 sm:min-w-28">
              <Beef className="size-4" /> Vleesjes
            </TabsTrigger>
            <TabsTrigger value="groenten" className="px-3 sm:min-w-28">
              <Carrot className="size-4" /> Groenten
            </TabsTrigger>
          </TabsList>
          <Button onClick={() => setAdding(tab)} className="shrink-0">
            <Plus className="size-4" /> {NEW_LABEL[tab]}
          </Button>
        </div>
        <TabsContent value="potjes">
          <PotjesView portions={portions} today={today} diners={diners} potjeNames={potjeNames} {...addingProps("potjes")} />
        </TabsContent>
        <TabsContent value="vleesjes">
          <VleesjesView vleesjes={vleesjes} vleesjeNames={vleesjeNames} {...addingProps("vleesjes")} />
        </TabsContent>
        <TabsContent value="groenten">
          <GroentenView groenten={groenten} groenteNames={groenteNames} {...addingProps("groenten")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
