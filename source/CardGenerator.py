#!/usr/bin/env python
import random
import xlsxwriter

song_list = []
try:
    with open("songs.txt","r", encoding='utf-8') as f:
        song_list = f.readlines()
except:
    print("Could not read songs.txt file.")

# Card style and number of cards to generate
columns = 3
rows   = 2
cards = 100

minNum = 1
maxNum = len(song_list)

# Spreadsheed table formats
workbook = xlsxwriter.Workbook('bingoCards.xlsx')
worksheet = workbook.add_worksheet()
cell_format = workbook.add_format()
cell_format.set_align('center')
cell_format.set_border(1)
cell_format.set_border_color('black')
merge_format = workbook.add_format({
    'align':  'center',
    'bold':   True,
    'border': 1,
})

number_list = []
for n in range(maxNum):
    for x in range(12):
        number_list.append(n+1) 

def add_card_to_spreadsheet(bingoCard, row):
    worksheet.merge_range(row, 0, row, 2, "Music Bingo", merge_format)
    row += 1
    for col, data in enumerate(bingoCard):
        worksheet.write_column(row, col, data, cell_format)
    row += 3
    return row

def generate_cards():
    randRange = range(minNum, maxNum)
    row = 0

    try:
        for h in range(cards):
            card_as_numbers = []
            try:
                card_as_numbers = random.sample(randRange, columns * rows)
            except:
                print("There are not enough songs in the list to generate bingo cards.")
            bingoCard = []
            for i in range(columns):
                bingoRow = []
                for j in range(rows):
                    number = card_as_numbers[i * rows + j]
                    bingoRow.append(song_list[number])
                bingoCard.append(bingoRow)
            row = add_card_to_spreadsheet(bingoCard, row)
    except:
        print("Bingo cards could not been generated.")

    return row > 0 # if greated than 0, cards were generated

def format_and_save_file():
    worksheet.autofit()
    workbook.close()
    print("Music bingo cards generated succesfully.")

def main():
    if (generate_cards()):
        format_and_save_file()
    
main()