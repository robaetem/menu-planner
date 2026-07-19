"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Beef, Carrot, CookingPot, Snowflake } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Diner, Groente, Potje, Vleesje } from "@/lib/types";
import type { FreezerTab } from "@/lib/freezer/inventory";
import { PotjesView } from "../potjes/potjes-view";
import { VleesjesView } from "../vleesjes/vleesjes-view";
import { GroentenView } from "./groenten-view";

export function DiepvriesView({
  initialTab,
  potjes,
  diners,
  potjeNames,
  vleesjes,
  vleesjeNames,
  groenten,
  groenteNames,
}: {
  initialTab: FreezerTab;
  potjes: Potje[];
  diners: Diner[];
  potjeNames: string[];
  vleesjes: Vleesje[];
  vleesjeNames: string[];
  groenten: Groente[];
  groenteNames: string[];
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<FreezerTab>(initialTab);

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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Diepvries</h1>
          <p className="mt-1 text-sm text-muted-foreground">Alles wat momenteel in de diepvries ligt.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={changeTab} className="mt-6 gap-0">
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
        <TabsContent value="potjes" className="mt-7">
          <PotjesView potjes={potjes} diners={diners} potjeNames={potjeNames} />
        </TabsContent>
        <TabsContent value="vleesjes" className="mt-7">
          <VleesjesView vleesjes={vleesjes} vleesjeNames={vleesjeNames} />
        </TabsContent>
        <TabsContent value="groenten" className="mt-7">
          <GroentenView groenten={groenten} groenteNames={groenteNames} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
