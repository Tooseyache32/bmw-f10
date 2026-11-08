import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { root, createPool, databaseUrl, assertProjectDatabase } from './config.js';

export async function seed(pool) {
   
  const context = { window: {} };
  vm.runInNewContext(await readFile(path.join(root, 'assets/js/specs.js'), 'utf8'), context, { timeout: 1000 });
  const catalog = context.window.F10_SPECS;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [slug, model] of Object.entries(catalog.models)) {
      const result = await client.query(`INSERT INTO vehicle_models
        (slug,name,title,description,scope,consumption_scope,release_url,source_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,title=EXCLUDED.title,
        description=EXCLUDED.description,scope=EXCLUDED.scope,consumption_scope=EXCLUDED.consumption_scope,
        release_url=EXCLUDED.release_url,source_url=EXCLUDED.source_url RETURNING id`,
      [slug,model.name,model.title,model.description,catalog.scope,catalog.consumptionScope,catalog.release,model.source]);
      await client.query(`INSERT INTO model_specs
        (model_id,fuel,cylinders,displacement,power,kw,torque,acceleration,consumption,speed,power_rpm,torque_rpm,engine_code)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (model_id) DO UPDATE SET fuel=EXCLUDED.fuel,cylinders=EXCLUDED.cylinders,
        displacement=EXCLUDED.displacement,power=EXCLUDED.power,kw=EXCLUDED.kw,torque=EXCLUDED.torque,
        acceleration=EXCLUDED.acceleration,consumption=EXCLUDED.consumption,speed=EXCLUDED.speed,
        power_rpm=EXCLUDED.power_rpm,torque_rpm=EXCLUDED.torque_rpm,engine_code=EXCLUDED.engine_code`,
      [result.rows[0].id,model.fuel,model.cylinders,model.displacement,model.power,model.kw,model.torque,
        model.acceleration,model.consumption,model.speed,model.powerRpm,model.torqueRpm,model.engineCode]);
    }
    for (const [slug,label] of [['selection','Подбор F10'],['vehicle','Вопрос по автомобилю'],['service','Обслуживание'],['other','Другое']]) {
      await client.query('INSERT INTO inquiry_topics (slug,label) VALUES ($1,$2) ON CONFLICT (slug) DO UPDATE SET label=EXCLUDED.label', [slug,label]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertProjectDatabase(databaseUrl);
  const pool = createPool();
  try { await seed(pool); console.log('Seed ready: 3 models, their specifications, 4 topics. No user credentials seeded.'); }
  catch { console.error('Seed failed. Run migrations and verify the isolated database.'); process.exitCode = 1; }
  finally { await pool.end(); }
}
