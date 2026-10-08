// /latest/ was renamed /news/; keep old links (and their #c= / #l= hashes) working.
location.replace('../news/' + location.hash);
