  CREATE TABLE reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text,
    content text,
    image_url text,
    review_type text NOT NULL DEFAULT 'testimonial' CHECK (review_type IN
  ('testimonial', 'result_photo')),
    featured boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow public read" ON reviews FOR SELECT USING (true);
  CREATE POLICY "Allow all for anon" ON reviews FOR ALL USING (true);


  CREATE TABLE review_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(review_id, product_id)
  );

  ALTER TABLE review_products ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow public read" ON review_products FOR SELECT USING (true);
  CREATE POLICY "Allow all for anon" ON review_products FOR ALL USING (true);

 


  INSERT INTO storage.buckets (id, name, public) VALUES ('review-images',
  'review-images', true);
  CREATE POLICY "Allow public read on review-images" ON storage.objects FOR SELECT
  USING (bucket_id = 'review-images');
  CREATE POLICY "Allow public upload on review-images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'review-images');
  CREATE POLICY "Allow public delete on review-images" ON storage.objects FOR DELETE
  USING (bucket_id = 'review-images');