#!/usr/bin/env bash
# pre-R6 | R6 | R7 | |R7 - R6| x8, per cave, and the R6 -> R7 pixel statistics.
cd "$1" || exit 1
for id in $2; do
  ffmpeg -loglevel error -y -i $id-preR6.png -i $id-R6.png -i $id-R7.png -filter_complex \
    "[1]split[b0][b1];[2]split[c0][c1];[b1][c1]blend=all_mode=difference,lutrgb=r=min(val*8\,255):g=min(val*8\,255):b=min(val*8\,255),scale=400:-1[d];[0]scale=400:-1,pad=iw+6:ih:0:0:white[a];[b0]scale=400:-1,pad=iw+6:ih:0:0:white[b];[c0]scale=400:-1,pad=iw+6:ih:0:0:white[c];[a][b][c][d]hstack=4" \
    -frames:v 1 -q:v 3 $id-strip.jpg
  ffmpeg -loglevel error -i $id-R6.png -i $id-R7.png -filter_complex "[0][1]blend=all_mode=difference,format=gray,lut=y='if(gt(val\,8)\,255\,0)',signalstats,metadata=print:file=/tmp/col1-thr3.txt" -f null - 2>/dev/null
  echo "$id: fraction of pixels differing by >8 (R6 -> R7): $(python3 -c "print(round(float('$(grep YAVG /tmp/col1-thr3.txt | sed 's/.*=//')')/255, 5))")"
done
