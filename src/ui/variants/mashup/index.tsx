// The owner's pick of the bake-off: Spotlight's sections and hero, the Steam Store's featured capsules and wide rows.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Capsule, ConsoleBanner, Shelf, TileFocus, WIDE_SMALL_W, WIDE_W, WideCapsule } from "../../kit";
import { openGamePage, useVideo, warmVideos } from "../../hooks";
import { useGameDetails } from "../../store/model";
import { Console } from "../spotlight/Console";
import { useTileFocus } from "../spotlight/common";
import { DiscoverProps, makeStore, Spotlight } from "../spotlight/Store";
import { SV_CSS } from "../store/common";
import { variant as store } from "../store";
import { HeroCapsule } from "../store/Home";
import { Variant } from "../types";

const SPOTLIGHT_PICKS = 5;

function Discover({ model, progress, remember }: DiscoverProps) {
  const remembered = useTileFocus(remember);
  // The focused Featured capsule plays its preview, and only one video plays at a time.
  const [previewId, setPreviewId] = useState<number>();
  const preview = useVideo(useGameDetails(previewId), "small");
  const onFocus: TileFocus = useCallback((g, el) => {
    setPreviewId(undefined);
    remembered(g, el);
  }, [remembered]);
  const onFeaturedFocus: TileFocus = useCallback((g, el) => {
    setPreviewId(g.rom_id);
    remembered(g, el);
  }, [remembered]);
  const featured = useMemo(() => model.featured.slice(SPOTLIGHT_PICKS), [model.featured]);
  useEffect(() => warmVideos(featured), [featured]);
  return (
    <>
      <style>{SV_CSS}</style>
      <Spotlight picks={model.featured.slice(0, SPOTLIGHT_PICKS)} progress={progress} remember={remember} playVideo={previewId === undefined} />
      <div style={{ height: 24 }} />
      {featured.length > 0 && (
        <Shelf title="Featured" section="featured" gap={12}>
          {featured.map((g) => <HeroCapsule key={g.rom_id} game={g} progress={progress[g.rom_id]} video={g.rom_id === previewId ? preview : undefined} first={false} onFocus={onFeaturedFocus} onOpen={openGamePage} />)}
        </Shelf>
      )}
      {model.recent && (
        <Shelf title={model.recent.title} section="recent">
          {model.recent.games.map((g) => <Capsule key={g.rom_id} game={g} progress={progress[g.rom_id]} onFocus={onFocus} onOpen={openGamePage} />)}
        </Shelf>
      )}
      {model.forYou && (
        <Shelf title={model.forYou.title} subtitle={model.forYou.subtitle} section="foryou">
          {model.forYou.games.map((g) => <WideCapsule key={g.rom_id} game={g} progress={progress[g.rom_id]} width={WIDE_W} onFocus={onFocus} onOpen={openGamePage} />)}
        </Shelf>
      )}
      {model.rated && (
        <Shelf title={model.rated.title} section="rated-row">
          {model.rated.games.map((g) => <WideCapsule key={g.rom_id} game={g} progress={progress[g.rom_id]} width={WIDE_SMALL_W} onFocus={onFocus} onOpen={openGamePage} />)}
        </Shelf>
      )}
      {model.consoles.length > 0 && (
        <Shelf title="Consoles" section="consoles">
          {model.consoles.map((c) => <ConsoleBanner key={c.platform.id} entry={c} width={250} height={130} onFocus={(id) => remember(`[data-section="consoles"] [data-platform="${id}"]`)} />)}
        </Shelf>
      )}
    </>
  );
}

export const variant: Variant = { key: "mashup", name: "Mashup", Store: makeStore(Discover), Game: store.Game, Console };
