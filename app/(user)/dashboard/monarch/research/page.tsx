import { getAggregatedNews } from "@/lib/research/rss";
import { getActiveUserRssFeeds } from "@/lib/rss-feeds/actions";
import { ResearchPage } from "@/components/research/research-page";

export default async function Research() {
  const customFeeds = await getActiveUserRssFeeds();
  const initial = await getAggregatedNews(undefined, customFeeds);
  return <ResearchPage initial={initial} />;
}
