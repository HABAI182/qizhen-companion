"""Plan actual non-default Cubism keyforms from issued native SDK snapshots.

This writes JSON requests only. CMO3/MOC3 are produced by Cubism, never this script.
The neutral form and source UV/topology remain untouched.
"""
import argparse
import json
import math
import pathlib
import struct

def f32(value):
    return struct.unpack('f',struct.pack('f',value))[0]

def area(a,b,c):
    return (b['x']-a['x'])*(c['y']-a['y'])-(b['y']-a['y'])*(c['x']-a['x'])

def deform(point,angle_x,angle_y):
    x,y=point['x'],point['y']
    u=(x-627)/627
    blend=max(0,min(1,(1030-y)/200))
    blend=blend*blend*(3-2*blend)
    dx=(angle_x*(9+3*max(0,1-u*u)-.007*(x-627))-angle_y*u*1.2)*blend
    dy=(angle_y*(-7+1.5*u*u+.006*(y-560))+angle_x*u*1.4)*blend
    return {'x':f32(x+dx),'y':f32(y+dy)}

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--snapshots',required=True)
    p.add_argument('--output',required=True)
    args=p.parse_args()
    snapshots=pathlib.Path(args.snapshots)
    output=pathlib.Path(args.output)
    output.mkdir(parents=True,exist_ok=True)
    checks=[]
    for index in range(12,29):
        response=json.loads((snapshots/f'{index:04d}-tools-call.json').read_text(encoding='utf-8'))
        issued=response['result']['structuredContent']
        state=issued['state']; stored=state['stored']
        axes={a['parameterGuid']:a for a in stored['axes']}
        assert {a['parameterId']['value'] for a in axes.values()}=={'ParamAngleX','ParamAngleY'}
        assert len(stored['cells'])==len(stored['forms'])==9 and not stored['morphKeys']
        assert len({c['formGuid'] for c in stored['cells']})==9
        default_tuple={g:a['defaultValue'] for g,a in axes.items()}
        default_cell=next(c for c in stored['cells'] if {d['parameterGuid']:d['value'] for d in c['coordinates']}==default_tuple)
        forms={f['formGuid']:f for f in stored['forms']}
        neutral=forms[default_cell['formGuid']]['positions']
        assert all(f['positions']==neutral for f in forms.values()),'Expected untouched initial key grid'
        triangles=stored['sourceGeometry']['triangleIndices']
        edits=[]; minimum_ratio=math.inf; maximum_delta=0
        for cell in stored['cells']:
            if cell['formGuid']==default_cell['formGuid']:continue
            values={axes[d['parameterGuid']]['parameterId']['value']:d['value']/30 for d in cell['coordinates']}
            positions=[deform(v,values['ParamAngleX'],values['ParamAngleY']) for v in neutral]
            for before,after in zip(neutral,positions):
                maximum_delta=max(maximum_delta,math.hypot(after['x']-before['x'],after['y']-before['y']))
            for start in range(0,len(triangles),3):
                ids=triangles[start:start+3]
                old=area(*(neutral[j] for j in ids));new=area(*(positions[j] for j in ids))
                assert old*new>0,'A proposed keyform would flip a native triangle'
                minimum_ratio=min(minimum_ratio,new/old)
            edits.append({'formGuid':cell['formGuid'],'coordinates':cell['coordinates'],'positions':positions})
        request={'name':'zju.authoring.write','arguments':{
            'operationId':'head-xy-v14-'+state['id'].lower(),'kind':'mesh','id':state['id'],
            'expectedModelId':state['modelId'],'expectedSha256':issued['sha256'],'edits':edits}}
        filename=state['id']+'-head-xy.request.json'
        (output/filename).write_text(json.dumps(request,separators=(',',':')),encoding='utf-8')
        checks.append({'mesh':state['id'],'vertices':len(neutral),'nonDefaultForms':len(edits),
                       'maximumVertexDelta':maximum_delta,'minimumTriangleAreaRatio':minimum_ratio,
                       'request':filename,'neutralPreservedByConstruction':True})
    report={'basis':'v13 approved neutral art','source':'actual native SDK snapshots',
            'method':'shared bounded smooth displacement field in native canvas coordinates',
            'nativeWriteVerified':False,'visualAcceptance':'pending','meshes':checks}
    (output/'plan-checks.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'meshes':len(checks),'nonDefaultForms':sum(c['nonDefaultForms'] for c in checks),
                      'minAreaRatio':min(c['minimumTriangleAreaRatio'] for c in checks),
                      'maxDisplacement':max(c['maximumVertexDelta'] for c in checks)}))

if __name__=='__main__': main()
