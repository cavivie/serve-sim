import {test,expect} from "bun:test";
import {parseAndroidAx} from "../android-ax";
test("Android AX maps bounds, rotation and redacts password labels",()=>{
 const xml='<hierarchy rotation="1"><node text="A &amp; B" class="Button" enabled="true" clickable="true" bounds="[10,20][100,60]"/><node text="secret" password="true" class="EditText" bounds="[10,70][90,100]"/></hierarchy>';
 const data=parseAndroidAx(xml,1080,2400);
 expect(data.screen).toEqual({width:2400,height:1080});
 expect(data.elements[0]?.label).toBe("A & B");
 expect(data.elements[0]?.frame).toEqual({x:10,y:20,width:90,height:40});
 expect(JSON.stringify(data)).not.toContain("secret");
 expect(()=>parseAndroidAx("ERROR",1,1)).toThrow();
});
