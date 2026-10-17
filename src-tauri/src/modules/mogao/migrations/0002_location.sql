CREATE TABLE mogao_location(singleton INTEGER PRIMARY KEY CHECK(singleton=1),work_id TEXT REFERENCES mogao_works(id) ON DELETE SET NULL,chapter_id TEXT REFERENCES mogao_chapters(id) ON DELETE SET NULL);
INSERT INTO mogao_location(singleton) VALUES(1);
