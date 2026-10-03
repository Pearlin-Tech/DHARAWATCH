import ee
ee.Initialize(project='dharawatch')
try:
    info = ee.FeatureCollection('WWF/HydroSHEDS/v1/FreeFlowingRivers').limit(1).getInfo()
    print("HydroRIVERS Exists!")
except Exception as e:
    print(f"Error: {e}")
