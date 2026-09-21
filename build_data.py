import os
import sys
import json
import sqlite3
import time

def classify_point(kb, sk, sp):
    # Determine Category
    kb_str = str(kb).strip() if kb is not None else ''
    if kb_str == '1':
        cat = 'BKU'
    elif kb_str == '2':
        cat = 'Campuran'
    elif kb_str == '3':
        cat = 'BTT'
    elif kb_str in ('4', '5', '7', '8'):
        cat = 'Fasum'
    elif kb_str == '6':
        cat = 'Kosong'
    elif kb_str == '9':
        cat = 'Non Respon'
    else:
        cat = 'Lainnya'
    
    # Determine Status (BERHASIL vs BELUM)
    sk_str = str(sk).strip() if sk is not None else ''
    sp_str = str(sp).strip() if sp is not None else ''
    
    if sk_str in ('1. Ditemukan', '2. Baru'):
        st = 'BERHASIL'
    elif sk_str in ('5. Tidak dapat ditemui sampai akhir pendataan', '4. Tidak Eligible'):
        st = 'BELUM'
    elif sp_str in ('APPROVED BY Pengawas', 'SUBMITTED BY Pencacah', 'EDITED BY Admin Kabupaten', 'COMPLETED BY Admin Kabupaten'):
        st = 'BERHASIL'
    elif sp_str in ('REJECTED BY Pengawas', 'REJECTED BY Admin Kabupaten', 'DRAFT', 'REVOKED BY Pengawas'):
        st = 'BELUM'
    elif kb_str == '6':
        st = 'BERHASIL'
    elif kb_str == '9':
        st = 'BELUM'
    else:
        st = 'BERHASIL'
        
    return cat, st

def round_coords(coords, precision=6):
    if isinstance(coords, (int, float)):
        return round(coords, precision)
    elif isinstance(coords, list):
        return [round_coords(c, precision) for c in coords]
    return coords

def compute_bbox(coords):
    # Returns [min_lng, min_lat, max_lng, max_lat]
    def extract_pts(c):
        if isinstance(c[0], (int, float)):
            yield c
        else:
            for sub in c:
                yield from extract_pts(sub)
    
    min_lng, min_lat = float('inf'), float('inf')
    max_lng, max_lat = float('-inf'), float('-inf')
    for pt in extract_pts(coords):
        if pt[0] < min_lng: min_lng = pt[0]
        if pt[0] > max_lng: max_lng = pt[0]
        if pt[1] < min_lat: min_lat = pt[1]
        if pt[1] > max_lat: max_lat = pt[1]
    return [round(min_lng, 6), round(min_lat, 6), round(max_lng, 6), round(max_lat, 6)]

def main():
    t0 = time.time()
    print("=== MEMULAI DATA BUILD PIPELINE WEBGIS MANADO ===")
    
    os.makedirs("data/points", exist_ok=True)
    os.makedirs("css", exist_ok=True)
    os.makedirs("js", exist_ok=True)
    
    # 1. Baca GeoJSON Poligon SLS
    sls_src = "../Peta Digital/SLS_Manado_Dissolved.geojson"
    print(f"Membaca {sls_src}...")
    with open(sls_src, "r", encoding="utf-8") as f:
        sls_geojson = json.load(f)
    
    print(f"Total SLS Polygons: {len(sls_geojson['features'])}")
    
    # 2. Baca Database Titik Geotag SE
    gpkg_path = "../geotag_hasil_SE_sementara.gpkg"
    print(f"Menghubungkan ke SQLite GeoPackage {gpkg_path}...")
    conn = sqlite3.connect(gpkg_path)
    
    cursor = conn.cursor()
    cursor.execute("""
        SELECT fid, code_identity, fullcode, status_keberadaan, status_pendataan,
               kode_bang_value, accuracy, latitude, longitude, data1
        FROM geotag_keluarga_manado
    """)
    
    print("Mengelompokkan titik berdasarkan 14-digit ID SLS...")
    points_by_sls = {}
    stats_by_sls = {}
    total_pts = 0
    
    for row in cursor:
        fid, ci, fc, sk, sp, kb, acc, lat, lng, data1 = row
        total_pts += 1
        
        sls_id = fc[:14] if fc and len(fc) >= 14 else 'UNKNOWN'
        cat, st = classify_point(kb, sk, sp)
        
        # Inisialisasi list titik
        if sls_id not in points_by_sls:
            points_by_sls[sls_id] = []
            stats_by_sls[sls_id] = {
                'total': 0, 'berhasil': 0, 'belum': 0,
                'bku': 0, 'campuran': 0, 'btt': 0,
                'fasum': 0, 'kosong': 0, 'non_respon': 0, 'lainnya': 0
            }
            
        pt_obj = {
            'i': fid,
            'c': ci or '',
            'd': data1 or '',
            'f': fc or '',
            'k': kb or '',
            'sk': sk or '',
            'sp': sp or '',
            'a': round(acc, 1) if acc is not None else 0,
            'lt': round(lat, 6) if lat is not None else 0,
            'lg': round(lng, 6) if lng is not None else 0,
            'cat': cat,
            'st': st
        }
        points_by_sls[sls_id].append(pt_obj)
        
        # Update statistics
        s = stats_by_sls[sls_id]
        s['total'] += 1
        if st == 'BERHASIL':
            s['berhasil'] += 1
        else:
            s['belum'] += 1
            
        if cat == 'BKU': s['bku'] += 1
        elif cat == 'Campuran': s['campuran'] += 1
        elif cat == 'BTT': s['btt'] += 1
        elif cat == 'Fasum': s['fasum'] += 1
        elif cat == 'Kosong': s['kosong'] += 1
        elif cat == 'Non Respon': s['non_respon'] += 1
        else: s['lainnya'] += 1
        
    print(f"Total {total_pts} titik telah dikelompokkan ke {len(points_by_sls)} SLS.")
    
    # 3. Tulis file JSON per-SLS ke data/points/{sls_id}.json
    print("Menulis berkas partisi titik ke data/points/...")
    for sls_id, pts in points_by_sls.items():
        out_file = f"data/points/{sls_id}.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(pts, f, separators=(',', ':'))
            
    # 4. Bangun Hierarchy & Index Administratif
    hierarchy = {}  # kec -> desa -> list of SLS
    sls_lookup = {}
    
    cleaned_features = []
    for feat in sls_geojson['features']:
        props = feat['properties']
        geom = feat['geometry']
        idsls = str(props.get('idsls', '')).strip()
        nmkec = (props.get('nmkec') or 'UNKNOWN').strip()
        nmdesa = (props.get('nmdesa') or 'UNKNOWN').strip()
        nmsls = (props.get('nmsls') or 'UNKNOWN').strip()
        luas = round(float(props.get('luas') or 0), 4)
        
        bbox = compute_bbox(geom['coordinates'])
        center = [round((bbox[1] + bbox[3]) / 2, 6), round((bbox[0] + bbox[2]) / 2, 6)]
        
        # Round polygon coords
        geom['coordinates'] = round_coords(geom['coordinates'], 6)
        
        # Ambil statistik titik untuk SLS ini
        sls_stat = stats_by_sls.get(idsls, {
            'total': 0, 'berhasil': 0, 'belum': 0,
            'bku': 0, 'campuran': 0, 'btt': 0,
            'fasum': 0, 'kosong': 0, 'non_respon': 0, 'lainnya': 0
        })
        
        # Tambahkan ke props GeoJSON
        feat['properties'] = {
            'idsls': idsls,
            'nmkec': nmkec,
            'nmdesa': nmdesa,
            'nmsls': nmsls,
            'luas': luas,
            'stat': sls_stat,
            'bbox': bbox,
            'center': center
        }
        cleaned_features.append(feat)
        
        # Tambahkan ke index hierarchy
        if nmkec not in hierarchy:
            hierarchy[nmkec] = {}
        if nmdesa not in hierarchy[nmkec]:
            hierarchy[nmkec][nmdesa] = []
            
        hierarchy[nmkec][nmdesa].append({
            'idsls': idsls,
            'nmsls': nmsls,
            'bbox': bbox,
            'center': center,
            'stat': sls_stat
        })
        
        sls_lookup[idsls] = {
            'idsls': idsls,
            'nmkec': nmkec,
            'nmdesa': nmdesa,
            'nmsls': nmsls,
            'bbox': bbox,
            'center': center,
            'stat': sls_stat
        }

    # Urutkan hierarchy secara abjad
    sorted_hierarchy = {}
    for kec in sorted(hierarchy.keys()):
        sorted_hierarchy[kec] = {}
        for desa in sorted(hierarchy[kec].keys()):
            sorted_hierarchy[kec][desa] = sorted(hierarchy[kec][desa], key=lambda x: x['nmsls'])
            
    with open("data/hierarchy.json", "w", encoding="utf-8") as f:
        json.dump(sorted_hierarchy, f, separators=(',', ':'))
        
    print(f"Hierarki tersimpan: {len(sorted_hierarchy)} Kecamatan.")

    # Simpan SLS GeoJSON yang sudah dirampingkan
    sls_geojson['features'] = cleaned_features
    with open("data/sls_manado.geojson", "w", encoding="utf-8") as f:
        json.dump(sls_geojson, f, separators=(',', ':'))
    print(f"GeoJSON SLS tersimpan: data/sls_manado.geojson ({os.path.getsize('data/sls_manado.geojson') / (1024*1024):.2f} MB)")
    
    # 5. Salin dan rapikan data Kecamatan
    kec_src = "../Peta Digital/Final_Kec_202517171.geojson"
    if os.path.exists(kec_src):
        with open(kec_src, "r", encoding="utf-8") as f:
            kec_geojson = json.load(f)
        for feat in kec_geojson['features']:
            feat['geometry']['coordinates'] = round_coords(feat['geometry']['coordinates'], 6)
            p = feat['properties']
            feat['properties'] = {
                'idkec': p.get('idkec', ''),
                'nmkec': (p.get('nmkec') or '').strip(),
                'luas': round(float(p.get('luas') or 0), 4)
            }
        with open("data/kecamatan.geojson", "w", encoding="utf-8") as f:
            json.dump(kec_geojson, f, separators=(',', ':'))
        print("Batas Kecamatan tersimpan: data/kecamatan.geojson")

    elapsed = time.time() - t0
    print(f"=== PIPELINE SELESAI DALAM {elapsed:.2f} DETIK ===")

if __name__ == "__main__":
    main()
