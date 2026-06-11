import { Helmet } from "react-helmet-async";

type SEOProps = {
  title: string;
  description: string;
  canonicalPath?: string;
};

const SITE_URL = "https://www.epost.pk";
const SOCIAL_IMAGE_URL = `${SITE_URL}/assets/pakistan-post-logo.png`;

export default function SEO({ title, description, canonicalPath = "/" }: SEOProps) {
  const canonicalUrl = `${SITE_URL}${canonicalPath.startsWith("/") ? canonicalPath : `/${canonicalPath}`}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={SOCIAL_IMAGE_URL} />

      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={SOCIAL_IMAGE_URL} />
      <meta name="twitter:image:alt" content={`ePost.pk - ${title}`} />
    </Helmet>
  );
}