#!/usr/bin/env bash
# before | after | |after - before| x8, and pixel statistics of the difference (luma, 0-255).
cd "$1" || exit 1
for id in rift_kiln_tube meridian_escarp_pocket meridian_terrace_crack divide_brine_cistern basin_dish_lee_vault; do
  ffmpeg -loglevel error -y -i $id-before.png -i $id-after.png -filter_complex \
    "[0]split[a0][a1];[1]split[b0][b1];[a1][b1]blend=all_mode=difference,lutrgb=r=min(val*8\,255):g=min(val*8\,255):b=min(val*8\,255),scale=480:-1[d];[a0]scale=480:-1,pad=iw+6:ih:0:0:white[a];[b0]scale=480:-1,pad=iw+6:ih:0:0:white[b];[a][b][d]hstack=3" \
    -frames:v 1 -q:v 3 $id-strip.jpg
  stats=$(ffmpeg -loglevel error -i $id-before.png -i $id-after.png -filter_complex "[0][1]blend=all_mode=difference,format=gray,split[x][y];[x]signalstats,metadata=print:file=-[o1];[y]lut=y='if(gt(val\,8)\,255\,0)',signalstats,metadata=print:file=/tmp/col1-thr.txt[o2];[o1][o2]hstack" -f null - 2>/dev/null | grep -E "YAVG|YMAX" | tr '\n' ' ')
  frac=$(grep YAVG /tmp/col1-thr.txt | sed 's/.*=//')
  echo "$id: diff $stats; fraction of pixels differing by >8: $(python3 -c "print(round(float('$frac')/255, 5))")"
done
