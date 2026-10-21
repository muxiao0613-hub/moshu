/** Fully local vector fallback used until replaced by transparent image frames. */
export function FoxGirl({sleeping=false,happy=false,waving=false}:{sleeping?:boolean;happy?:boolean;waving?:boolean}) {
  return <svg viewBox="0 0 240 270" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={sleeping?'正在休息的南华':waving?'正在打招呼的南华':'狐狸少女南华'}>
    <ellipse cx="123" cy="254" rx="57" ry="8" fill="#344b3a" opacity=".12"/>
    <g className="fox-tail"><path d="M155 213C218 239 244 185 217 153C224 195 187 167 163 190Z" fill="#D28A51" stroke="#744D3B" strokeWidth="3" strokeLinejoin="round"/><path d="M209 199C231 186 227 165 217 153C222 178 210 178 198 182Z" fill="#FFF3D9"/></g>
    <g className="fox-body">
      <path d="M96 225L94 246Q101 254 110 247L114 226M130 226L134 247Q145 255 150 246L145 224" fill="#FAE1CE" stroke="#744D3B" strokeWidth="3"/>
      <path d="M93 242L110 243L110 251Q97 259 90 252ZM134 243L150 242L153 252Q143 259 133 251Z" fill="#677965" stroke="#744D3B" strokeWidth="3"/>
      <path d="M90 146C71 159 63 185 68 200L89 195L85 226Q120 245 157 226L151 194L173 200Q179 174 151 146Z" fill="#9AAE8C" stroke="#744D3B" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M102 149L119 174L140 149L146 221Q121 232 97 221Z" fill="#FFF6DF"/>
      <path d="M93 178L149 178L151 188L91 188Z" fill="#D58A60"/>
      <path d="M119 180C97 168 99 194 118 184C131 198 143 175 120 180Z" fill="#F6DBA2" stroke="#744D3B" strokeWidth="2"/>
      <path d="M69 195Q64 210 76 211Q85 211 87 198M153 197Q158 212 169 209Q177 205 172 197" fill="#FAE1CE" stroke="#744D3B" strokeWidth="3"/>
      <path d="M78 180L86 187M160 180L155 187" stroke="#6F866B" strokeWidth="3" strokeLinecap="round"/>
    </g>
    <g className="fox-head">
      <g className="fox-ears"><path d="M65 76Q35 45 46 13Q74 17 90 48M149 46Q167 15 196 13Q207 49 174 80" fill="#C4814B" stroke="#744D3B" strokeWidth="3.5" strokeLinejoin="round"/><path d="M59 54Q50 38 53 26Q69 32 76 50M163 50Q176 31 188 26Q193 42 181 57" fill="#F2C1A5"/></g>
      <path d="M58 83C49 33 173 22 184 79L190 154L166 146L155 165L140 144L77 151L53 162Z" fill="#BB7744" stroke="#744D3B" strokeWidth="3.5" strokeLinejoin="round"/>
      <path d="M66 90C64 58 178 53 177 96L171 120C161 158 82 162 69 122Z" fill="#FFE8D2" stroke="#744D3B" strokeWidth="3"/>
      <path d="M60 95C53 58 83 39 117 44C152 36 184 58 181 100L159 86L155 68L136 90L123 68L107 91L95 72L81 94L78 80Z" fill="#D99457" stroke="#744D3B" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M77 64Q85 49 103 48M162 57L170 67" stroke="#F4C989" strokeWidth="4" strokeLinecap="round"/>
      {sleeping?<g stroke="#744D3B" strokeWidth="3.5" strokeLinecap="round"><path d="M81 108Q89 115 98 108M143 108Q152 115 160 108"/></g>:<g className="fox-eyes"><ellipse cx="90" cy="110" rx="7.5" ry={happy?6:11} fill="#655C48"/><ellipse cx="151" cy="110" rx="7.5" ry={happy?6:11} fill="#655C48"/><circle cx="92" cy="106" r="3" fill="#FFFCF0"/><circle cx="153" cy="106" r="3" fill="#FFFCF0"/></g>}
      <ellipse cx="78" cy="125" rx="10" ry="5" fill="#EBA89B" opacity={happy?.95:.7}/><ellipse cx="164" cy="125" rx="10" ry="5" fill="#EBA89B" opacity={happy?.95:.7}/>
      <path d={sleeping?'M116 133Q120 136 124 133':happy?'M111 129Q120 145 130 129Z':'M113 131Q121 138 129 131'} fill={happy?'#D58A79':'none'} stroke="#9B6650" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M168 85L183 88L177 100L164 94Z" fill="#F8E5AE" stroke="#744D3B" strokeWidth="2"/><circle cx="172" cy="91" r="3" fill="#7D9475"/>
    </g>
    {(happy||waving)&&<g className="fox-heart" fill="#D58A79"><path d="M194 80C177 65 196 56 201 65C210 53 223 68 201 83Z"/><path d="M30 107C18 95 31 87 36 95C44 88 53 99 36 111Z"/></g>}
    {waving&&<g className="fox-sparkle" fill="#E8B65D"><path d="M40 58L44 69L55 73L44 77L40 88L36 77L25 73L36 69Z"/><path d="M208 132L211 140L219 143L211 146L208 154L205 146L197 143L205 140Z"/></g>}
    {sleeping&&<g className="fox-zzz" fill="#7D9475" fontWeight="600"><text x="178" y="76" fontSize="19">z</text><text x="194" y="58" fontSize="24">z</text></g>}
  </svg>;
}
